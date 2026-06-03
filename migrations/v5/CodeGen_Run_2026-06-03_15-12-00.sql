/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e031cc66-cb76-4515-adbd-aac808653144' OR (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TotalCacheReadTokensUsed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e031cc66-cb76-4515-adbd-aac808653144',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100109,
            'TotalCacheReadTokensUsed',
            'Total Cache Read Tokens Used',
            'Total input tokens served from the AI provider''s prompt cache (cache reads / hits) across this agent run, summed from child prompt runs'' TokensCacheReadRollup and sub-agent runs'' TotalCacheReadTokensUsed. Counts only; the cost impact (cache reads are billed at a steep discount) is reflected in TotalCost. The cache counterpart of TotalPromptTokensUsed.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3016dd5-c3b9-49d3-b0ac-7aa77ca7a64a' OR (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TotalCacheWriteTokensUsed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f3016dd5-c3b9-49d3-b0ac-7aa77ca7a64a',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100110,
            'TotalCacheWriteTokensUsed',
            'Total Cache Write Tokens Used',
            'Total input tokens written to the AI provider''s prompt cache (cache writes / creation) across this agent run, summed from child prompt runs'' TokensCacheWriteRollup and sub-agent runs'' TotalCacheWriteTokensUsed. Populated for providers that bill cache creation (e.g. Anthropic); 0 or NULL otherwise. The cache counterpart of TotalCompletionTokensUsed.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b7b51aa7-f0af-4e84-a360-6a63a4b98074' OR (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'CacheReadPricePerUnit')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b7b51aa7-f0af-4e84-a360-6a63a4b98074',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            100037,
            'CacheReadPricePerUnit',
            'Cache Read Price Per Unit',
            'Optional price per unit for input tokens served from the AI provider''s prompt cache (cache reads / hits), expressed in the same currency and UnitType (e.g. per 1M tokens) as InputPricePerUnit. When NULL, cache-read tokens are priced at InputPricePerUnit. Cache reads are usually far cheaper than uncached input (e.g. ~0.1x for Anthropic/Gemini, ~0.5x for OpenAI).',
            'decimal',
            9,
            18,
            8,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77ea784f-5522-497a-971b-b1277681d5c3' OR (EntityID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127' AND Name = 'CacheWritePricePerUnit')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '77ea784f-5522-497a-971b-b1277681d5c3',
            '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127', -- Entity: MJ: AI Model Costs
            100038,
            'CacheWritePricePerUnit',
            'Cache Write Price Per Unit',
            'Optional price per unit for input tokens written to the AI provider''s prompt cache (cache writes / creation), expressed in the same currency and UnitType as InputPricePerUnit. When NULL, cache-write tokens are priced at InputPricePerUnit. Populated for providers that bill cache creation separately (e.g. Anthropic, ~1.25x input); leave NULL for providers that do not (OpenAI, Gemini), which also report 0 cache-write tokens.',
            'decimal',
            9,
            18,
            8,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89dacee1-6160-4ed9-9623-b458571ee42f' OR (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TokensCacheReadRollup')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '89dacee1-6160-4ed9-9623-b458571ee42f',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100191,
            'TokensCacheReadRollup',
            'Tokens Cache Read Rollup',
            'Rollup of TokensCacheRead across this prompt run and all of its descendant prompt runs (e.g. the individual attempts behind a parallel / multi-attempt / failover consolidation). For a leaf run this equals TokensCacheRead. Use this (not TokensCacheRead) when aggregating cache reads up a prompt-run or agent-run hierarchy so fan-out provider calls are not under-counted.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1879842-1930-4ac7-9002-53b2400b0d2e' OR (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'TokensCacheWriteRollup')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c1879842-1930-4ac7-9002-53b2400b0d2e',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100192,
            'TokensCacheWriteRollup',
            'Tokens Cache Write Rollup',
            'Rollup of TokensCacheWrite across this prompt run and all of its descendant prompt runs. For a leaf run this equals TokensCacheWrite. Mirrors TokensUsedRollup/TokensPromptRollup; populated for providers that report cache writes (e.g. Anthropic), otherwise 0 or NULL.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Index for Foreign Keys for AIModelCost */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_ModelID ON [${flyway:defaultSchema}].[AIModelCost] ([ModelID]);

-- Index for foreign key VendorID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_VendorID ON [${flyway:defaultSchema}].[AIModelCost] ([VendorID]);

-- Index for foreign key PriceTypeID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_PriceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_PriceTypeID ON [${flyway:defaultSchema}].[AIModelCost] ([PriceTypeID]);

-- Index for foreign key UnitTypeID in table AIModelCost
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelCost_UnitTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelCost]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelCost_UnitTypeID ON [${flyway:defaultSchema}].[AIModelCost] ([UnitTypeID]);

/* Base View SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: vwAIModelCosts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Costs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelCost
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIModelCosts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIModelCosts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelCosts]
AS
SELECT
    a.*,
    MJAIModel_ModelID.[Name] AS [Model],
    MJAIVendor_VendorID.[Name] AS [Vendor],
    MJAIModelPriceType_PriceTypeID.[Name] AS [PriceType],
    MJAIModelPriceUnitType_UnitTypeID.[Name] AS [UnitType]
FROM
    [${flyway:defaultSchema}].[AIModelCost] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_ModelID
  ON
    [a].[ModelID] = MJAIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS MJAIVendor_VendorID
  ON
    [a].[VendorID] = MJAIVendor_VendorID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModelPriceType] AS MJAIModelPriceType_PriceTypeID
  ON
    [a].[PriceTypeID] = MJAIModelPriceType_PriceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModelPriceUnitType] AS MJAIModelPriceUnitType_UnitTypeID
  ON
    [a].[UnitTypeID] = MJAIModelPriceUnitType_UnitTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelCosts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: Permissions for vwAIModelCosts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelCosts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spCreateAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelCost
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIModelCost]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelCost];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelCost]
    @ID uniqueidentifier = NULL,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Status nvarchar(20),
    @Currency nchar(3),
    @PriceTypeID uniqueidentifier,
    @InputPricePerUnit decimal(18, 8),
    @OutputPricePerUnit decimal(18, 8),
    @UnitTypeID uniqueidentifier,
    @ProcessingType nvarchar(20),
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @CacheReadPricePerUnit_Clear bit = 0,
    @CacheReadPricePerUnit decimal(18, 8) = NULL,
    @CacheWritePricePerUnit_Clear bit = 0,
    @CacheWritePricePerUnit decimal(18, 8) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
            (
                [ID],
                [ModelID],
                [VendorID],
                [StartedAt],
                [EndedAt],
                [Status],
                [Currency],
                [PriceTypeID],
                [InputPricePerUnit],
                [OutputPricePerUnit],
                [UnitTypeID],
                [ProcessingType],
                [Comments],
                [CacheReadPricePerUnit],
                [CacheWritePricePerUnit]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ModelID,
                @VendorID,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, sysdatetimeoffset()) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                @Status,
                @Currency,
                @PriceTypeID,
                @InputPricePerUnit,
                @OutputPricePerUnit,
                @UnitTypeID,
                @ProcessingType,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @CacheReadPricePerUnit_Clear = 1 THEN NULL ELSE ISNULL(@CacheReadPricePerUnit, NULL) END,
                CASE WHEN @CacheWritePricePerUnit_Clear = 1 THEN NULL ELSE ISNULL(@CacheWritePricePerUnit, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModelCost]
            (
                [ModelID],
                [VendorID],
                [StartedAt],
                [EndedAt],
                [Status],
                [Currency],
                [PriceTypeID],
                [InputPricePerUnit],
                [OutputPricePerUnit],
                [UnitTypeID],
                [ProcessingType],
                [Comments],
                [CacheReadPricePerUnit],
                [CacheWritePricePerUnit]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ModelID,
                @VendorID,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, sysdatetimeoffset()) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                @Status,
                @Currency,
                @PriceTypeID,
                @InputPricePerUnit,
                @OutputPricePerUnit,
                @UnitTypeID,
                @ProcessingType,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @CacheReadPricePerUnit_Clear = 1 THEN NULL ELSE ISNULL(@CacheReadPricePerUnit, NULL) END,
                CASE WHEN @CacheWritePricePerUnit_Clear = 1 THEN NULL ELSE ISNULL(@CacheWritePricePerUnit, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelCosts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelCost] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Model Costs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelCost] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spUpdateAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelCost
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIModelCost]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelCost];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelCost]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier = NULL,
    @VendorID uniqueidentifier = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @Currency nchar(3) = NULL,
    @PriceTypeID uniqueidentifier = NULL,
    @InputPricePerUnit decimal(18, 8) = NULL,
    @OutputPricePerUnit decimal(18, 8) = NULL,
    @UnitTypeID uniqueidentifier = NULL,
    @ProcessingType nvarchar(20) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @CacheReadPricePerUnit_Clear bit = 0,
    @CacheReadPricePerUnit decimal(18, 8) = NULL,
    @CacheWritePricePerUnit_Clear bit = 0,
    @CacheWritePricePerUnit decimal(18, 8) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelCost]
    SET
        [ModelID] = ISNULL(@ModelID, [ModelID]),
        [VendorID] = ISNULL(@VendorID, [VendorID]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Currency] = ISNULL(@Currency, [Currency]),
        [PriceTypeID] = ISNULL(@PriceTypeID, [PriceTypeID]),
        [InputPricePerUnit] = ISNULL(@InputPricePerUnit, [InputPricePerUnit]),
        [OutputPricePerUnit] = ISNULL(@OutputPricePerUnit, [OutputPricePerUnit]),
        [UnitTypeID] = ISNULL(@UnitTypeID, [UnitTypeID]),
        [ProcessingType] = ISNULL(@ProcessingType, [ProcessingType]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [CacheReadPricePerUnit] = CASE WHEN @CacheReadPricePerUnit_Clear = 1 THEN NULL ELSE ISNULL(@CacheReadPricePerUnit, [CacheReadPricePerUnit]) END,
        [CacheWritePricePerUnit] = CASE WHEN @CacheWritePricePerUnit_Clear = 1 THEN NULL ELSE ISNULL(@CacheWritePricePerUnit, [CacheWritePricePerUnit]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIModelCosts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelCosts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelCost] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelCost table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIModelCost]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIModelCost];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelCost
ON [${flyway:defaultSchema}].[AIModelCost]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelCost]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelCost] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Model Costs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelCost] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spDeleteAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelCost
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIModelCost]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelCost];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelCost]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelCost]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelCost] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Model Costs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelCost] TO [cdp_Developer], [cdp_Integration];

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
            p.[Depth] < 100
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
            p.[Depth] < 100
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
    MJAIPrompt_PromptID.[Name] AS [Prompt],
    MJAIModel_ModelID.[Name] AS [Model],
    MJAIVendor_VendorID.[Name] AS [Vendor],
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIConfiguration_ConfigurationID.[Name] AS [Configuration],
    MJAIPromptRun_ParentID.[RunName] AS [Parent],
    MJAIAgentRun_AgentRunID.[RunName] AS [AgentRun],
    MJAIModel_OriginalModelID.[Name] AS [OriginalModel],
    MJAIPromptRun_RerunFromPromptRunID.[RunName] AS [RerunFromPromptRun],
    MJAIPrompt_JudgeID.[Name] AS [Judge],
    MJAIPrompt_ChildPromptID.[Name] AS [ChildPrompt],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    root_ParentID.RootID AS [RootParentID],
    root_RerunFromPromptRunID.RootID AS [RootRerunFromPromptRunID]
FROM
    [${flyway:defaultSchema}].[AIPromptRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_PromptID
  ON
    [a].[PromptID] = MJAIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_ModelID
  ON
    [a].[ModelID] = MJAIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS MJAIVendor_VendorID
  ON
    [a].[VendorID] = MJAIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS MJAIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = MJAIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_ParentID
  ON
    [a].[ParentID] = MJAIPromptRun_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_OriginalModelID
  ON
    [a].[OriginalModelID] = MJAIModel_OriginalModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_RerunFromPromptRunID
  ON
    [a].[RerunFromPromptRunID] = MJAIPromptRun_RerunFromPromptRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_JudgeID
  ON
    [a].[JudgeID] = MJAIPrompt_JudgeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ChildPromptID
  ON
    [a].[ChildPromptID] = MJAIPrompt_ChildPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [a].[TestRunID] = MJTestRun_TestRunID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]([a].[ID], [a].[RerunFromPromptRunID]) AS root_RerunFromPromptRunID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Permissions for vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @RunAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ExecutionTimeMS_Clear bit = 0,
    @ExecutionTimeMS int = NULL,
    @Messages_Clear bit = 0,
    @Messages nvarchar(MAX) = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @TokensPrompt_Clear bit = 0,
    @TokensPrompt int = NULL,
    @TokensCompletion_Clear bit = 0,
    @TokensCompletion int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder_Clear bit = 0,
    @ExecutionOrder int = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL,
    @Cost_Clear bit = 0,
    @Cost decimal(19, 8) = NULL,
    @CostCurrency_Clear bit = 0,
    @CostCurrency nvarchar(10) = NULL,
    @TokensUsedRollup_Clear bit = 0,
    @TokensUsedRollup int = NULL,
    @TokensPromptRollup_Clear bit = 0,
    @TokensPromptRollup int = NULL,
    @TokensCompletionRollup_Clear bit = 0,
    @TokensCompletionRollup int = NULL,
    @Temperature_Clear bit = 0,
    @Temperature decimal(3, 2) = NULL,
    @TopP_Clear bit = 0,
    @TopP decimal(3, 2) = NULL,
    @TopK_Clear bit = 0,
    @TopK int = NULL,
    @MinP_Clear bit = 0,
    @MinP decimal(3, 2) = NULL,
    @FrequencyPenalty_Clear bit = 0,
    @FrequencyPenalty decimal(3, 2) = NULL,
    @PresencePenalty_Clear bit = 0,
    @PresencePenalty decimal(3, 2) = NULL,
    @Seed_Clear bit = 0,
    @Seed int = NULL,
    @StopSequences_Clear bit = 0,
    @StopSequences nvarchar(MAX) = NULL,
    @ResponseFormat_Clear bit = 0,
    @ResponseFormat nvarchar(50) = NULL,
    @LogProbs_Clear bit = 0,
    @LogProbs bit = NULL,
    @TopLogProbs_Clear bit = 0,
    @TopLogProbs int = NULL,
    @DescendantCost_Clear bit = 0,
    @DescendantCost decimal(18, 6) = NULL,
    @ValidationAttemptCount_Clear bit = 0,
    @ValidationAttemptCount int = NULL,
    @SuccessfulValidationCount_Clear bit = 0,
    @SuccessfulValidationCount int = NULL,
    @FinalValidationPassed_Clear bit = 0,
    @FinalValidationPassed bit = NULL,
    @ValidationBehavior_Clear bit = 0,
    @ValidationBehavior nvarchar(50) = NULL,
    @RetryStrategy_Clear bit = 0,
    @RetryStrategy nvarchar(50) = NULL,
    @MaxRetriesConfigured_Clear bit = 0,
    @MaxRetriesConfigured int = NULL,
    @FinalValidationError_Clear bit = 0,
    @FinalValidationError nvarchar(500) = NULL,
    @ValidationErrorCount_Clear bit = 0,
    @ValidationErrorCount int = NULL,
    @CommonValidationError_Clear bit = 0,
    @CommonValidationError nvarchar(255) = NULL,
    @FirstAttemptAt_Clear bit = 0,
    @FirstAttemptAt datetimeoffset = NULL,
    @LastAttemptAt_Clear bit = 0,
    @LastAttemptAt datetimeoffset = NULL,
    @TotalRetryDurationMS_Clear bit = 0,
    @TotalRetryDurationMS int = NULL,
    @ValidationAttempts_Clear bit = 0,
    @ValidationAttempts nvarchar(MAX) = NULL,
    @ValidationSummary_Clear bit = 0,
    @ValidationSummary nvarchar(MAX) = NULL,
    @FailoverAttempts_Clear bit = 0,
    @FailoverAttempts int = NULL,
    @FailoverErrors_Clear bit = 0,
    @FailoverErrors nvarchar(MAX) = NULL,
    @FailoverDurations_Clear bit = 0,
    @FailoverDurations nvarchar(MAX) = NULL,
    @OriginalModelID_Clear bit = 0,
    @OriginalModelID uniqueidentifier = NULL,
    @OriginalRequestStartTime_Clear bit = 0,
    @OriginalRequestStartTime datetimeoffset = NULL,
    @TotalFailoverDuration_Clear bit = 0,
    @TotalFailoverDuration int = NULL,
    @RerunFromPromptRunID_Clear bit = 0,
    @RerunFromPromptRunID uniqueidentifier = NULL,
    @ModelSelection_Clear bit = 0,
    @ModelSelection nvarchar(MAX) = NULL,
    @Status nvarchar(50) = NULL,
    @Cancelled bit = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(MAX) = NULL,
    @ModelPowerRank_Clear bit = 0,
    @ModelPowerRank int = NULL,
    @SelectionStrategy_Clear bit = 0,
    @SelectionStrategy nvarchar(50) = NULL,
    @CacheHit bit = NULL,
    @CacheKey_Clear bit = 0,
    @CacheKey nvarchar(500) = NULL,
    @JudgeID_Clear bit = 0,
    @JudgeID uniqueidentifier = NULL,
    @JudgeScore_Clear bit = 0,
    @JudgeScore float(53) = NULL,
    @WasSelectedResult bit = NULL,
    @StreamingEnabled bit = NULL,
    @FirstTokenTime_Clear bit = 0,
    @FirstTokenTime int = NULL,
    @ErrorDetails_Clear bit = 0,
    @ErrorDetails nvarchar(MAX) = NULL,
    @ChildPromptID_Clear bit = 0,
    @ChildPromptID uniqueidentifier = NULL,
    @QueueTime_Clear bit = 0,
    @QueueTime int = NULL,
    @PromptTime_Clear bit = 0,
    @PromptTime int = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime int = NULL,
    @ModelSpecificResponseDetails_Clear bit = 0,
    @ModelSpecificResponseDetails nvarchar(MAX) = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @AssistantPrefill_Clear bit = 0,
    @AssistantPrefill nvarchar(MAX) = NULL,
    @TokensCacheRead_Clear bit = 0,
    @TokensCacheRead int = NULL,
    @TokensCacheWrite_Clear bit = 0,
    @TokensCacheWrite int = NULL,
    @TokensCacheReadRollup_Clear bit = 0,
    @TokensCacheReadRollup int = NULL,
    @TokensCacheWriteRollup_Clear bit = 0,
    @TokensCacheWriteRollup int = NULL
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
                [TestRunID],
                [AssistantPrefill],
                [TokensCacheRead],
                [TokensCacheWrite],
                [TokensCacheReadRollup],
                [TokensCacheWriteRollup]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PromptID,
                @ModelID,
                @VendorID,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                ISNULL(@RunAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ExecutionTimeMS_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionTimeMS, NULL) END,
                CASE WHEN @Messages_Clear = 1 THEN NULL ELSE ISNULL(@Messages, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @TokensPrompt_Clear = 1 THEN NULL ELSE ISNULL(@TokensPrompt, NULL) END,
                CASE WHEN @TokensCompletion_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletion, NULL) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, NULL) END,
                ISNULL(@Success, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@RunType, 'Single'),
                CASE WHEN @ExecutionOrder_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionOrder, NULL) END,
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END,
                CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, NULL) END,
                CASE WHEN @CostCurrency_Clear = 1 THEN NULL ELSE ISNULL(@CostCurrency, NULL) END,
                CASE WHEN @TokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsedRollup, NULL) END,
                CASE WHEN @TokensPromptRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensPromptRollup, NULL) END,
                CASE WHEN @TokensCompletionRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletionRollup, NULL) END,
                CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, NULL) END,
                CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, NULL) END,
                CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, NULL) END,
                CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, NULL) END,
                CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, NULL) END,
                CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, NULL) END,
                CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, NULL) END,
                CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, NULL) END,
                CASE WHEN @ResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ResponseFormat, NULL) END,
                CASE WHEN @LogProbs_Clear = 1 THEN NULL ELSE ISNULL(@LogProbs, NULL) END,
                CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, NULL) END,
                CASE WHEN @DescendantCost_Clear = 1 THEN NULL ELSE ISNULL(@DescendantCost, NULL) END,
                CASE WHEN @ValidationAttemptCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttemptCount, NULL) END,
                CASE WHEN @SuccessfulValidationCount_Clear = 1 THEN NULL ELSE ISNULL(@SuccessfulValidationCount, NULL) END,
                CASE WHEN @FinalValidationPassed_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationPassed, NULL) END,
                CASE WHEN @ValidationBehavior_Clear = 1 THEN NULL ELSE ISNULL(@ValidationBehavior, NULL) END,
                CASE WHEN @RetryStrategy_Clear = 1 THEN NULL ELSE ISNULL(@RetryStrategy, NULL) END,
                CASE WHEN @MaxRetriesConfigured_Clear = 1 THEN NULL ELSE ISNULL(@MaxRetriesConfigured, NULL) END,
                CASE WHEN @FinalValidationError_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationError, NULL) END,
                CASE WHEN @ValidationErrorCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationErrorCount, NULL) END,
                CASE WHEN @CommonValidationError_Clear = 1 THEN NULL ELSE ISNULL(@CommonValidationError, NULL) END,
                CASE WHEN @FirstAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstAttemptAt, NULL) END,
                CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, NULL) END,
                CASE WHEN @TotalRetryDurationMS_Clear = 1 THEN NULL ELSE ISNULL(@TotalRetryDurationMS, NULL) END,
                CASE WHEN @ValidationAttempts_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttempts, NULL) END,
                CASE WHEN @ValidationSummary_Clear = 1 THEN NULL ELSE ISNULL(@ValidationSummary, NULL) END,
                CASE WHEN @FailoverAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverAttempts, 0) END,
                CASE WHEN @FailoverErrors_Clear = 1 THEN NULL ELSE ISNULL(@FailoverErrors, NULL) END,
                CASE WHEN @FailoverDurations_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDurations, NULL) END,
                CASE WHEN @OriginalModelID_Clear = 1 THEN NULL ELSE ISNULL(@OriginalModelID, NULL) END,
                CASE WHEN @OriginalRequestStartTime_Clear = 1 THEN NULL ELSE ISNULL(@OriginalRequestStartTime, NULL) END,
                CASE WHEN @TotalFailoverDuration_Clear = 1 THEN NULL ELSE ISNULL(@TotalFailoverDuration, NULL) END,
                CASE WHEN @RerunFromPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@RerunFromPromptRunID, NULL) END,
                CASE WHEN @ModelSelection_Clear = 1 THEN NULL ELSE ISNULL(@ModelSelection, NULL) END,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @ModelPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@ModelPowerRank, NULL) END,
                CASE WHEN @SelectionStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SelectionStrategy, NULL) END,
                ISNULL(@CacheHit, 0),
                CASE WHEN @CacheKey_Clear = 1 THEN NULL ELSE ISNULL(@CacheKey, NULL) END,
                CASE WHEN @JudgeID_Clear = 1 THEN NULL ELSE ISNULL(@JudgeID, NULL) END,
                CASE WHEN @JudgeScore_Clear = 1 THEN NULL ELSE ISNULL(@JudgeScore, NULL) END,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                CASE WHEN @FirstTokenTime_Clear = 1 THEN NULL ELSE ISNULL(@FirstTokenTime, NULL) END,
                CASE WHEN @ErrorDetails_Clear = 1 THEN NULL ELSE ISNULL(@ErrorDetails, NULL) END,
                CASE WHEN @ChildPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ChildPromptID, NULL) END,
                CASE WHEN @QueueTime_Clear = 1 THEN NULL ELSE ISNULL(@QueueTime, NULL) END,
                CASE WHEN @PromptTime_Clear = 1 THEN NULL ELSE ISNULL(@PromptTime, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                CASE WHEN @ModelSpecificResponseDetails_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseDetails, NULL) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, NULL) END,
                CASE WHEN @TokensCacheRead_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheRead, NULL) END,
                CASE WHEN @TokensCacheWrite_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWrite, NULL) END,
                CASE WHEN @TokensCacheReadRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheReadRollup, NULL) END,
                CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, NULL) END
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
                [TestRunID],
                [AssistantPrefill],
                [TokensCacheRead],
                [TokensCacheWrite],
                [TokensCacheReadRollup],
                [TokensCacheWriteRollup]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptID,
                @ModelID,
                @VendorID,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                ISNULL(@RunAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ExecutionTimeMS_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionTimeMS, NULL) END,
                CASE WHEN @Messages_Clear = 1 THEN NULL ELSE ISNULL(@Messages, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @TokensPrompt_Clear = 1 THEN NULL ELSE ISNULL(@TokensPrompt, NULL) END,
                CASE WHEN @TokensCompletion_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletion, NULL) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, NULL) END,
                ISNULL(@Success, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@RunType, 'Single'),
                CASE WHEN @ExecutionOrder_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionOrder, NULL) END,
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END,
                CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, NULL) END,
                CASE WHEN @CostCurrency_Clear = 1 THEN NULL ELSE ISNULL(@CostCurrency, NULL) END,
                CASE WHEN @TokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsedRollup, NULL) END,
                CASE WHEN @TokensPromptRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensPromptRollup, NULL) END,
                CASE WHEN @TokensCompletionRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletionRollup, NULL) END,
                CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, NULL) END,
                CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, NULL) END,
                CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, NULL) END,
                CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, NULL) END,
                CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, NULL) END,
                CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, NULL) END,
                CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, NULL) END,
                CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, NULL) END,
                CASE WHEN @ResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ResponseFormat, NULL) END,
                CASE WHEN @LogProbs_Clear = 1 THEN NULL ELSE ISNULL(@LogProbs, NULL) END,
                CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, NULL) END,
                CASE WHEN @DescendantCost_Clear = 1 THEN NULL ELSE ISNULL(@DescendantCost, NULL) END,
                CASE WHEN @ValidationAttemptCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttemptCount, NULL) END,
                CASE WHEN @SuccessfulValidationCount_Clear = 1 THEN NULL ELSE ISNULL(@SuccessfulValidationCount, NULL) END,
                CASE WHEN @FinalValidationPassed_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationPassed, NULL) END,
                CASE WHEN @ValidationBehavior_Clear = 1 THEN NULL ELSE ISNULL(@ValidationBehavior, NULL) END,
                CASE WHEN @RetryStrategy_Clear = 1 THEN NULL ELSE ISNULL(@RetryStrategy, NULL) END,
                CASE WHEN @MaxRetriesConfigured_Clear = 1 THEN NULL ELSE ISNULL(@MaxRetriesConfigured, NULL) END,
                CASE WHEN @FinalValidationError_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationError, NULL) END,
                CASE WHEN @ValidationErrorCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationErrorCount, NULL) END,
                CASE WHEN @CommonValidationError_Clear = 1 THEN NULL ELSE ISNULL(@CommonValidationError, NULL) END,
                CASE WHEN @FirstAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstAttemptAt, NULL) END,
                CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, NULL) END,
                CASE WHEN @TotalRetryDurationMS_Clear = 1 THEN NULL ELSE ISNULL(@TotalRetryDurationMS, NULL) END,
                CASE WHEN @ValidationAttempts_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttempts, NULL) END,
                CASE WHEN @ValidationSummary_Clear = 1 THEN NULL ELSE ISNULL(@ValidationSummary, NULL) END,
                CASE WHEN @FailoverAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverAttempts, 0) END,
                CASE WHEN @FailoverErrors_Clear = 1 THEN NULL ELSE ISNULL(@FailoverErrors, NULL) END,
                CASE WHEN @FailoverDurations_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDurations, NULL) END,
                CASE WHEN @OriginalModelID_Clear = 1 THEN NULL ELSE ISNULL(@OriginalModelID, NULL) END,
                CASE WHEN @OriginalRequestStartTime_Clear = 1 THEN NULL ELSE ISNULL(@OriginalRequestStartTime, NULL) END,
                CASE WHEN @TotalFailoverDuration_Clear = 1 THEN NULL ELSE ISNULL(@TotalFailoverDuration, NULL) END,
                CASE WHEN @RerunFromPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@RerunFromPromptRunID, NULL) END,
                CASE WHEN @ModelSelection_Clear = 1 THEN NULL ELSE ISNULL(@ModelSelection, NULL) END,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @ModelPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@ModelPowerRank, NULL) END,
                CASE WHEN @SelectionStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SelectionStrategy, NULL) END,
                ISNULL(@CacheHit, 0),
                CASE WHEN @CacheKey_Clear = 1 THEN NULL ELSE ISNULL(@CacheKey, NULL) END,
                CASE WHEN @JudgeID_Clear = 1 THEN NULL ELSE ISNULL(@JudgeID, NULL) END,
                CASE WHEN @JudgeScore_Clear = 1 THEN NULL ELSE ISNULL(@JudgeScore, NULL) END,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                CASE WHEN @FirstTokenTime_Clear = 1 THEN NULL ELSE ISNULL(@FirstTokenTime, NULL) END,
                CASE WHEN @ErrorDetails_Clear = 1 THEN NULL ELSE ISNULL(@ErrorDetails, NULL) END,
                CASE WHEN @ChildPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ChildPromptID, NULL) END,
                CASE WHEN @QueueTime_Clear = 1 THEN NULL ELSE ISNULL(@QueueTime, NULL) END,
                CASE WHEN @PromptTime_Clear = 1 THEN NULL ELSE ISNULL(@PromptTime, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                CASE WHEN @ModelSpecificResponseDetails_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseDetails, NULL) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, NULL) END,
                CASE WHEN @TokensCacheRead_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheRead, NULL) END,
                CASE WHEN @TokensCacheWrite_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWrite, NULL) END,
                CASE WHEN @TokensCacheReadRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheReadRollup, NULL) END,
                CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
    @PromptID uniqueidentifier = NULL,
    @ModelID uniqueidentifier = NULL,
    @VendorID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @RunAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ExecutionTimeMS_Clear bit = 0,
    @ExecutionTimeMS int = NULL,
    @Messages_Clear bit = 0,
    @Messages nvarchar(MAX) = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @TokensPrompt_Clear bit = 0,
    @TokensPrompt int = NULL,
    @TokensCompletion_Clear bit = 0,
    @TokensCompletion int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder_Clear bit = 0,
    @ExecutionOrder int = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL,
    @Cost_Clear bit = 0,
    @Cost decimal(19, 8) = NULL,
    @CostCurrency_Clear bit = 0,
    @CostCurrency nvarchar(10) = NULL,
    @TokensUsedRollup_Clear bit = 0,
    @TokensUsedRollup int = NULL,
    @TokensPromptRollup_Clear bit = 0,
    @TokensPromptRollup int = NULL,
    @TokensCompletionRollup_Clear bit = 0,
    @TokensCompletionRollup int = NULL,
    @Temperature_Clear bit = 0,
    @Temperature decimal(3, 2) = NULL,
    @TopP_Clear bit = 0,
    @TopP decimal(3, 2) = NULL,
    @TopK_Clear bit = 0,
    @TopK int = NULL,
    @MinP_Clear bit = 0,
    @MinP decimal(3, 2) = NULL,
    @FrequencyPenalty_Clear bit = 0,
    @FrequencyPenalty decimal(3, 2) = NULL,
    @PresencePenalty_Clear bit = 0,
    @PresencePenalty decimal(3, 2) = NULL,
    @Seed_Clear bit = 0,
    @Seed int = NULL,
    @StopSequences_Clear bit = 0,
    @StopSequences nvarchar(MAX) = NULL,
    @ResponseFormat_Clear bit = 0,
    @ResponseFormat nvarchar(50) = NULL,
    @LogProbs_Clear bit = 0,
    @LogProbs bit = NULL,
    @TopLogProbs_Clear bit = 0,
    @TopLogProbs int = NULL,
    @DescendantCost_Clear bit = 0,
    @DescendantCost decimal(18, 6) = NULL,
    @ValidationAttemptCount_Clear bit = 0,
    @ValidationAttemptCount int = NULL,
    @SuccessfulValidationCount_Clear bit = 0,
    @SuccessfulValidationCount int = NULL,
    @FinalValidationPassed_Clear bit = 0,
    @FinalValidationPassed bit = NULL,
    @ValidationBehavior_Clear bit = 0,
    @ValidationBehavior nvarchar(50) = NULL,
    @RetryStrategy_Clear bit = 0,
    @RetryStrategy nvarchar(50) = NULL,
    @MaxRetriesConfigured_Clear bit = 0,
    @MaxRetriesConfigured int = NULL,
    @FinalValidationError_Clear bit = 0,
    @FinalValidationError nvarchar(500) = NULL,
    @ValidationErrorCount_Clear bit = 0,
    @ValidationErrorCount int = NULL,
    @CommonValidationError_Clear bit = 0,
    @CommonValidationError nvarchar(255) = NULL,
    @FirstAttemptAt_Clear bit = 0,
    @FirstAttemptAt datetimeoffset = NULL,
    @LastAttemptAt_Clear bit = 0,
    @LastAttemptAt datetimeoffset = NULL,
    @TotalRetryDurationMS_Clear bit = 0,
    @TotalRetryDurationMS int = NULL,
    @ValidationAttempts_Clear bit = 0,
    @ValidationAttempts nvarchar(MAX) = NULL,
    @ValidationSummary_Clear bit = 0,
    @ValidationSummary nvarchar(MAX) = NULL,
    @FailoverAttempts_Clear bit = 0,
    @FailoverAttempts int = NULL,
    @FailoverErrors_Clear bit = 0,
    @FailoverErrors nvarchar(MAX) = NULL,
    @FailoverDurations_Clear bit = 0,
    @FailoverDurations nvarchar(MAX) = NULL,
    @OriginalModelID_Clear bit = 0,
    @OriginalModelID uniqueidentifier = NULL,
    @OriginalRequestStartTime_Clear bit = 0,
    @OriginalRequestStartTime datetimeoffset = NULL,
    @TotalFailoverDuration_Clear bit = 0,
    @TotalFailoverDuration int = NULL,
    @RerunFromPromptRunID_Clear bit = 0,
    @RerunFromPromptRunID uniqueidentifier = NULL,
    @ModelSelection_Clear bit = 0,
    @ModelSelection nvarchar(MAX) = NULL,
    @Status nvarchar(50) = NULL,
    @Cancelled bit = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(MAX) = NULL,
    @ModelPowerRank_Clear bit = 0,
    @ModelPowerRank int = NULL,
    @SelectionStrategy_Clear bit = 0,
    @SelectionStrategy nvarchar(50) = NULL,
    @CacheHit bit = NULL,
    @CacheKey_Clear bit = 0,
    @CacheKey nvarchar(500) = NULL,
    @JudgeID_Clear bit = 0,
    @JudgeID uniqueidentifier = NULL,
    @JudgeScore_Clear bit = 0,
    @JudgeScore float(53) = NULL,
    @WasSelectedResult bit = NULL,
    @StreamingEnabled bit = NULL,
    @FirstTokenTime_Clear bit = 0,
    @FirstTokenTime int = NULL,
    @ErrorDetails_Clear bit = 0,
    @ErrorDetails nvarchar(MAX) = NULL,
    @ChildPromptID_Clear bit = 0,
    @ChildPromptID uniqueidentifier = NULL,
    @QueueTime_Clear bit = 0,
    @QueueTime int = NULL,
    @PromptTime_Clear bit = 0,
    @PromptTime int = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime int = NULL,
    @ModelSpecificResponseDetails_Clear bit = 0,
    @ModelSpecificResponseDetails nvarchar(MAX) = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @AssistantPrefill_Clear bit = 0,
    @AssistantPrefill nvarchar(MAX) = NULL,
    @TokensCacheRead_Clear bit = 0,
    @TokensCacheRead int = NULL,
    @TokensCacheWrite_Clear bit = 0,
    @TokensCacheWrite int = NULL,
    @TokensCacheReadRollup_Clear bit = 0,
    @TokensCacheReadRollup int = NULL,
    @TokensCacheWriteRollup_Clear bit = 0,
    @TokensCacheWriteRollup int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        [PromptID] = ISNULL(@PromptID, [PromptID]),
        [ModelID] = ISNULL(@ModelID, [ModelID]),
        [VendorID] = ISNULL(@VendorID, [VendorID]),
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [ConfigurationID] = CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, [ConfigurationID]) END,
        [RunAt] = ISNULL(@RunAt, [RunAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [ExecutionTimeMS] = CASE WHEN @ExecutionTimeMS_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionTimeMS, [ExecutionTimeMS]) END,
        [Messages] = CASE WHEN @Messages_Clear = 1 THEN NULL ELSE ISNULL(@Messages, [Messages]) END,
        [Result] = CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, [Result]) END,
        [TokensUsed] = CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, [TokensUsed]) END,
        [TokensPrompt] = CASE WHEN @TokensPrompt_Clear = 1 THEN NULL ELSE ISNULL(@TokensPrompt, [TokensPrompt]) END,
        [TokensCompletion] = CASE WHEN @TokensCompletion_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletion, [TokensCompletion]) END,
        [TotalCost] = CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, [TotalCost]) END,
        [Success] = ISNULL(@Success, [Success]),
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [RunType] = ISNULL(@RunType, [RunType]),
        [ExecutionOrder] = CASE WHEN @ExecutionOrder_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionOrder, [ExecutionOrder]) END,
        [AgentRunID] = CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, [AgentRunID]) END,
        [Cost] = CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, [Cost]) END,
        [CostCurrency] = CASE WHEN @CostCurrency_Clear = 1 THEN NULL ELSE ISNULL(@CostCurrency, [CostCurrency]) END,
        [TokensUsedRollup] = CASE WHEN @TokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsedRollup, [TokensUsedRollup]) END,
        [TokensPromptRollup] = CASE WHEN @TokensPromptRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensPromptRollup, [TokensPromptRollup]) END,
        [TokensCompletionRollup] = CASE WHEN @TokensCompletionRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletionRollup, [TokensCompletionRollup]) END,
        [Temperature] = CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, [Temperature]) END,
        [TopP] = CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, [TopP]) END,
        [TopK] = CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, [TopK]) END,
        [MinP] = CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, [MinP]) END,
        [FrequencyPenalty] = CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, [FrequencyPenalty]) END,
        [PresencePenalty] = CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, [PresencePenalty]) END,
        [Seed] = CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, [Seed]) END,
        [StopSequences] = CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, [StopSequences]) END,
        [ResponseFormat] = CASE WHEN @ResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ResponseFormat, [ResponseFormat]) END,
        [LogProbs] = CASE WHEN @LogProbs_Clear = 1 THEN NULL ELSE ISNULL(@LogProbs, [LogProbs]) END,
        [TopLogProbs] = CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, [TopLogProbs]) END,
        [DescendantCost] = CASE WHEN @DescendantCost_Clear = 1 THEN NULL ELSE ISNULL(@DescendantCost, [DescendantCost]) END,
        [ValidationAttemptCount] = CASE WHEN @ValidationAttemptCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttemptCount, [ValidationAttemptCount]) END,
        [SuccessfulValidationCount] = CASE WHEN @SuccessfulValidationCount_Clear = 1 THEN NULL ELSE ISNULL(@SuccessfulValidationCount, [SuccessfulValidationCount]) END,
        [FinalValidationPassed] = CASE WHEN @FinalValidationPassed_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationPassed, [FinalValidationPassed]) END,
        [ValidationBehavior] = CASE WHEN @ValidationBehavior_Clear = 1 THEN NULL ELSE ISNULL(@ValidationBehavior, [ValidationBehavior]) END,
        [RetryStrategy] = CASE WHEN @RetryStrategy_Clear = 1 THEN NULL ELSE ISNULL(@RetryStrategy, [RetryStrategy]) END,
        [MaxRetriesConfigured] = CASE WHEN @MaxRetriesConfigured_Clear = 1 THEN NULL ELSE ISNULL(@MaxRetriesConfigured, [MaxRetriesConfigured]) END,
        [FinalValidationError] = CASE WHEN @FinalValidationError_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationError, [FinalValidationError]) END,
        [ValidationErrorCount] = CASE WHEN @ValidationErrorCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationErrorCount, [ValidationErrorCount]) END,
        [CommonValidationError] = CASE WHEN @CommonValidationError_Clear = 1 THEN NULL ELSE ISNULL(@CommonValidationError, [CommonValidationError]) END,
        [FirstAttemptAt] = CASE WHEN @FirstAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstAttemptAt, [FirstAttemptAt]) END,
        [LastAttemptAt] = CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, [LastAttemptAt]) END,
        [TotalRetryDurationMS] = CASE WHEN @TotalRetryDurationMS_Clear = 1 THEN NULL ELSE ISNULL(@TotalRetryDurationMS, [TotalRetryDurationMS]) END,
        [ValidationAttempts] = CASE WHEN @ValidationAttempts_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttempts, [ValidationAttempts]) END,
        [ValidationSummary] = CASE WHEN @ValidationSummary_Clear = 1 THEN NULL ELSE ISNULL(@ValidationSummary, [ValidationSummary]) END,
        [FailoverAttempts] = CASE WHEN @FailoverAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverAttempts, [FailoverAttempts]) END,
        [FailoverErrors] = CASE WHEN @FailoverErrors_Clear = 1 THEN NULL ELSE ISNULL(@FailoverErrors, [FailoverErrors]) END,
        [FailoverDurations] = CASE WHEN @FailoverDurations_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDurations, [FailoverDurations]) END,
        [OriginalModelID] = CASE WHEN @OriginalModelID_Clear = 1 THEN NULL ELSE ISNULL(@OriginalModelID, [OriginalModelID]) END,
        [OriginalRequestStartTime] = CASE WHEN @OriginalRequestStartTime_Clear = 1 THEN NULL ELSE ISNULL(@OriginalRequestStartTime, [OriginalRequestStartTime]) END,
        [TotalFailoverDuration] = CASE WHEN @TotalFailoverDuration_Clear = 1 THEN NULL ELSE ISNULL(@TotalFailoverDuration, [TotalFailoverDuration]) END,
        [RerunFromPromptRunID] = CASE WHEN @RerunFromPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@RerunFromPromptRunID, [RerunFromPromptRunID]) END,
        [ModelSelection] = CASE WHEN @ModelSelection_Clear = 1 THEN NULL ELSE ISNULL(@ModelSelection, [ModelSelection]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Cancelled] = ISNULL(@Cancelled, [Cancelled]),
        [CancellationReason] = CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, [CancellationReason]) END,
        [ModelPowerRank] = CASE WHEN @ModelPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@ModelPowerRank, [ModelPowerRank]) END,
        [SelectionStrategy] = CASE WHEN @SelectionStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SelectionStrategy, [SelectionStrategy]) END,
        [CacheHit] = ISNULL(@CacheHit, [CacheHit]),
        [CacheKey] = CASE WHEN @CacheKey_Clear = 1 THEN NULL ELSE ISNULL(@CacheKey, [CacheKey]) END,
        [JudgeID] = CASE WHEN @JudgeID_Clear = 1 THEN NULL ELSE ISNULL(@JudgeID, [JudgeID]) END,
        [JudgeScore] = CASE WHEN @JudgeScore_Clear = 1 THEN NULL ELSE ISNULL(@JudgeScore, [JudgeScore]) END,
        [WasSelectedResult] = ISNULL(@WasSelectedResult, [WasSelectedResult]),
        [StreamingEnabled] = ISNULL(@StreamingEnabled, [StreamingEnabled]),
        [FirstTokenTime] = CASE WHEN @FirstTokenTime_Clear = 1 THEN NULL ELSE ISNULL(@FirstTokenTime, [FirstTokenTime]) END,
        [ErrorDetails] = CASE WHEN @ErrorDetails_Clear = 1 THEN NULL ELSE ISNULL(@ErrorDetails, [ErrorDetails]) END,
        [ChildPromptID] = CASE WHEN @ChildPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ChildPromptID, [ChildPromptID]) END,
        [QueueTime] = CASE WHEN @QueueTime_Clear = 1 THEN NULL ELSE ISNULL(@QueueTime, [QueueTime]) END,
        [PromptTime] = CASE WHEN @PromptTime_Clear = 1 THEN NULL ELSE ISNULL(@PromptTime, [PromptTime]) END,
        [CompletionTime] = CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, [CompletionTime]) END,
        [ModelSpecificResponseDetails] = CASE WHEN @ModelSpecificResponseDetails_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseDetails, [ModelSpecificResponseDetails]) END,
        [EffortLevel] = CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, [EffortLevel]) END,
        [RunName] = CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, [RunName]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [AssistantPrefill] = CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, [AssistantPrefill]) END,
        [TokensCacheRead] = CASE WHEN @TokensCacheRead_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheRead, [TokensCacheRead]) END,
        [TokensCacheWrite] = CASE WHEN @TokensCacheWrite_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWrite, [TokensCacheWrite]) END,
        [TokensCacheReadRollup] = CASE WHEN @TokensCacheReadRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheReadRollup, [TokensCacheReadRollup]) END,
        [TokensCacheWriteRollup] = CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, [TokensCacheWriteRollup]) END
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
    -- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia
    DECLARE @MJAIPromptRunMedias_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRunMedia]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] @ID = @MJAIPromptRunMedias_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ParentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ParentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsed int
    DECLARE @MJAIPromptRuns_ParentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ParentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_Success bit
    DECLARE @MJAIPromptRuns_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ParentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ParentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ParentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopK int
    DECLARE @MJAIPromptRuns_ParentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_Seed int
    DECLARE @MJAIPromptRuns_ParentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_LogProbs bit
    DECLARE @MJAIPromptRuns_ParentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ParentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ParentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ParentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ParentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ParentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ParentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_Cancelled bit
    DECLARE @MJAIPromptRuns_ParentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ParentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_CacheHit bit
    DECLARE @MJAIPromptRuns_ParentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ParentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ParentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ParentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ParentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_QueueTime int
    DECLARE @MJAIPromptRuns_ParentID_PromptTime int
    DECLARE @MJAIPromptRuns_ParentID_CompletionTime int
    DECLARE @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_EffortLevel int
    DECLARE @MJAIPromptRuns_ParentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_ParentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ParentIDID, @PromptID = @MJAIPromptRuns_ParentID_PromptID, @ModelID = @MJAIPromptRuns_ParentID_ModelID, @VendorID = @MJAIPromptRuns_ParentID_VendorID, @AgentID = @MJAIPromptRuns_ParentID_AgentID, @ConfigurationID = @MJAIPromptRuns_ParentID_ConfigurationID, @RunAt = @MJAIPromptRuns_ParentID_RunAt, @CompletedAt = @MJAIPromptRuns_ParentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ParentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ParentID_Messages, @Result = @MJAIPromptRuns_ParentID_Result, @TokensUsed = @MJAIPromptRuns_ParentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ParentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ParentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ParentID_TotalCost, @Success = @MJAIPromptRuns_ParentID_Success, @ErrorMessage = @MJAIPromptRuns_ParentID_ErrorMessage, @ParentID_Clear = 1, @ParentID = @MJAIPromptRuns_ParentID_ParentID, @RunType = @MJAIPromptRuns_ParentID_RunType, @ExecutionOrder = @MJAIPromptRuns_ParentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ParentID_AgentRunID, @Cost = @MJAIPromptRuns_ParentID_Cost, @CostCurrency = @MJAIPromptRuns_ParentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ParentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ParentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ParentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ParentID_Temperature, @TopP = @MJAIPromptRuns_ParentID_TopP, @TopK = @MJAIPromptRuns_ParentID_TopK, @MinP = @MJAIPromptRuns_ParentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ParentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ParentID_PresencePenalty, @Seed = @MJAIPromptRuns_ParentID_Seed, @StopSequences = @MJAIPromptRuns_ParentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ParentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ParentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ParentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ParentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ParentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ParentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ParentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ParentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ParentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ParentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ParentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ParentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ParentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ParentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ParentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ParentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ParentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ParentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ParentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ParentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ParentID_ModelSelection, @Status = @MJAIPromptRuns_ParentID_Status, @Cancelled = @MJAIPromptRuns_ParentID_Cancelled, @CancellationReason = @MJAIPromptRuns_ParentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ParentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ParentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ParentID_CacheHit, @CacheKey = @MJAIPromptRuns_ParentID_CacheKey, @JudgeID = @MJAIPromptRuns_ParentID_JudgeID, @JudgeScore = @MJAIPromptRuns_ParentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ParentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ParentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ParentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ParentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ParentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ParentID_QueueTime, @PromptTime = @MJAIPromptRuns_ParentID_PromptTime, @CompletionTime = @MJAIPromptRuns_ParentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ParentID_EffortLevel, @RunName = @MJAIPromptRuns_ParentID_RunName, @Comments = @MJAIPromptRuns_ParentID_Comments, @TestRunID = @MJAIPromptRuns_ParentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ParentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ParentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ParentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ParentID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_ParentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_RerunFromPromptRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Success bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopK int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Seed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_QueueTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [RerunFromPromptRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_RerunFromPromptRunIDID, @PromptID = @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @ModelID = @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @VendorID = @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @AgentID = @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @CompletedAt = @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_RerunFromPromptRunID_Messages, @Result = @MJAIPromptRuns_RerunFromPromptRunID_Result, @TokensUsed = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @Success = @MJAIPromptRuns_RerunFromPromptRunID_Success, @ErrorMessage = @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @RunType = @MJAIPromptRuns_RerunFromPromptRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @Cost = @MJAIPromptRuns_RerunFromPromptRunID_Cost, @CostCurrency = @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @TopP = @MJAIPromptRuns_RerunFromPromptRunID_TopP, @TopK = @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MinP = @MJAIPromptRuns_RerunFromPromptRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @Seed = @MJAIPromptRuns_RerunFromPromptRunID_Seed, @StopSequences = @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @RerunFromPromptRunID_Clear = 1, @RerunFromPromptRunID = @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @Status = @MJAIPromptRuns_RerunFromPromptRunID_Status, @Cancelled = @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @CacheKey = @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @JudgeID = @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @PromptTime = @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @RunName = @MJAIPromptRuns_RerunFromPromptRunID_RunName, @Comments = @MJAIPromptRuns_RerunFromPromptRunID_Comments, @TestRunID = @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_PromptRunIDID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_Status nvarchar(50)
    DECLARE @MJAIResultCache_PromptRunID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_PromptRunID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJAIResultCache_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_PromptRunIDID, @AIPromptID = @MJAIResultCache_PromptRunID_AIPromptID, @AIModelID = @MJAIResultCache_PromptRunID_AIModelID, @RunAt = @MJAIResultCache_PromptRunID_RunAt, @PromptText = @MJAIResultCache_PromptRunID_PromptText, @ResultText = @MJAIResultCache_PromptRunID_ResultText, @Status = @MJAIResultCache_PromptRunID_Status, @ExpiredOn = @MJAIResultCache_PromptRunID_ExpiredOn, @VendorID = @MJAIResultCache_PromptRunID_VendorID, @AgentID = @MJAIResultCache_PromptRunID_AgentID, @ConfigurationID = @MJAIResultCache_PromptRunID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_PromptRunID_PromptEmbedding, @PromptRunID_Clear = 1, @PromptRunID = @MJAIResultCache_PromptRunID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_PromptRunID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_PromptRunID_cursor
    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun
    DECLARE @MJContentProcessRunPromptRuns_AIPromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
        WHERE [AIPromptRunID] = @ID
    
    OPEN cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] @ID = @MJContentProcessRunPromptRuns_AIPromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    END
    
    CLOSE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    DEALLOCATE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for AIAgentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID ON [${flyway:defaultSchema}].[AIAgentRun] ([AgentID]);

-- Index for foreign key ParentRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ParentRunID]);

-- Index for foreign key ConversationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationID]);

-- Index for foreign key UserID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_UserID ON [${flyway:defaultSchema}].[AIAgentRun] ([UserID]);

-- Index for foreign key ConversationDetailID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationDetailID]);

-- Index for foreign key LastRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([LastRunID]);

-- Index for foreign key ConfigurationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConfigurationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConfigurationID]);

-- Index for foreign key OverrideModelID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideModelID ON [${flyway:defaultSchema}].[AIAgentRun] ([OverrideModelID]);

-- Index for foreign key OverrideVendorID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideVendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideVendorID ON [${flyway:defaultSchema}].[AIAgentRun] ([OverrideVendorID]);

-- Index for foreign key ScheduledJobRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ScheduledJobRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ScheduledJobRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ScheduledJobRunID]);

-- Index for foreign key TestRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_TestRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([TestRunID]);

-- Index for foreign key PrimaryScopeEntityID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_PrimaryScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_PrimaryScopeEntityID ON [${flyway:defaultSchema}].[AIAgentRun] ([PrimaryScopeEntityID]);

/* Root ID Function SQL for MJ: AI Agent Runs.ParentRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRun].[ParentRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentRunID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Root ID Function SQL for MJ: AI Agent Runs.LastRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunLastRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRun].[LastRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [LastRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[LastRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[LastRunID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [LastRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRuns]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIAgentRun_ParentRunID.[RunName] AS [ParentRun],
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJUser_UserID.[Name] AS [User],
    MJConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    MJAIAgentRun_LastRunID.[RunName] AS [LastRun],
    MJAIConfiguration_ConfigurationID.[Name] AS [Configuration],
    MJAIModel_OverrideModelID.[Name] AS [OverrideModel],
    MJAIVendor_OverrideVendorID.[Name] AS [OverrideVendor],
    MJScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    MJEntity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity],
    root_ParentRunID.RootID AS [RootParentRunID],
    root_LastRunID.RootID AS [RootLastRunID]
FROM
    [${flyway:defaultSchema}].[AIAgentRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_ParentRunID
  ON
    [a].[ParentRunID] = MJAIAgentRun_ParentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [a].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ConversationDetailID
  ON
    [a].[ConversationDetailID] = MJConversationDetail_ConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_LastRunID
  ON
    [a].[LastRunID] = MJAIAgentRun_LastRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS MJAIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = MJAIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_OverrideModelID
  ON
    [a].[OverrideModelID] = MJAIModel_OverrideModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS MJAIVendor_OverrideVendorID
  ON
    [a].[OverrideVendorID] = MJAIVendor_OverrideVendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwScheduledJobRuns] AS MJScheduledJobRun_ScheduledJobRunID
  ON
    [a].[ScheduledJobRunID] = MJScheduledJobRun_ScheduledJobRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [a].[TestRunID] = MJTestRun_TestRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = MJEntity_PrimaryScopeEntityID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]([a].[ID], [a].[ParentRunID]) AS root_ParentRunID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]([a].[ID], [a].[LastRunID]) AS root_LastRunID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Permissions for vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ParentRunID_Clear bit = 0,
    @ParentRunID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @AgentState_Clear bit = 0,
    @AgentState nvarchar(MAX) = NULL,
    @TotalTokensUsed_Clear bit = 0,
    @TotalTokensUsed int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @TotalPromptTokensUsed_Clear bit = 0,
    @TotalPromptTokensUsed int = NULL,
    @TotalCompletionTokensUsed_Clear bit = 0,
    @TotalCompletionTokensUsed int = NULL,
    @TotalTokensUsedRollup_Clear bit = 0,
    @TotalTokensUsedRollup int = NULL,
    @TotalPromptTokensUsedRollup_Clear bit = 0,
    @TotalPromptTokensUsedRollup int = NULL,
    @TotalCompletionTokensUsedRollup_Clear bit = 0,
    @TotalCompletionTokensUsedRollup int = NULL,
    @TotalCostRollup_Clear bit = 0,
    @TotalCostRollup decimal(19, 8) = NULL,
    @ConversationDetailID_Clear bit = 0,
    @ConversationDetailID uniqueidentifier = NULL,
    @ConversationDetailSequence_Clear bit = 0,
    @ConversationDetailSequence int = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(30) = NULL,
    @FinalStep_Clear bit = 0,
    @FinalStep nvarchar(30) = NULL,
    @FinalPayload_Clear bit = 0,
    @FinalPayload nvarchar(MAX) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @LastRunID_Clear bit = 0,
    @LastRunID uniqueidentifier = NULL,
    @StartingPayload_Clear bit = 0,
    @StartingPayload nvarchar(MAX) = NULL,
    @TotalPromptIterations int = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @OverrideModelID_Clear bit = 0,
    @OverrideModelID uniqueidentifier = NULL,
    @OverrideVendorID_Clear bit = 0,
    @OverrideVendorID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Verbose_Clear bit = 0,
    @Verbose bit = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(200) = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @TotalCacheReadTokensUsed_Clear bit = 0,
    @TotalCacheReadTokensUsed int = NULL,
    @TotalCacheWriteTokensUsed_Clear bit = 0,
    @TotalCacheWriteTokensUsed int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [ID],
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [ExternalReferenceID],
                [CompanyID],
                [TotalCacheReadTokensUsed],
                [TotalCacheWriteTokensUsed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                CASE WHEN @ParentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ParentRunID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @AgentState_Clear = 1 THEN NULL ELSE ISNULL(@AgentState, NULL) END,
                CASE WHEN @TotalTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsed, 0) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, 0.000000) END,
                CASE WHEN @TotalPromptTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsed, NULL) END,
                CASE WHEN @TotalCompletionTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsed, NULL) END,
                CASE WHEN @TotalTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsedRollup, NULL) END,
                CASE WHEN @TotalPromptTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCompletionTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCostRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCostRollup, NULL) END,
                CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, NULL) END,
                CASE WHEN @ConversationDetailSequence_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailSequence, NULL) END,
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @FinalStep_Clear = 1 THEN NULL ELSE ISNULL(@FinalStep, NULL) END,
                CASE WHEN @FinalPayload_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayload, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @LastRunID_Clear = 1 THEN NULL ELSE ISNULL(@LastRunID, NULL) END,
                CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, NULL) END,
                ISNULL(@TotalPromptIterations, 0),
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                CASE WHEN @OverrideModelID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideModelID, NULL) END,
                CASE WHEN @OverrideVendorID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideVendorID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Verbose_Clear = 1 THEN NULL ELSE ISNULL(@Verbose, 0) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @TotalCacheReadTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheReadTokensUsed, NULL) END,
                CASE WHEN @TotalCacheWriteTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheWriteTokensUsed, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [ExternalReferenceID],
                [CompanyID],
                [TotalCacheReadTokensUsed],
                [TotalCacheWriteTokensUsed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                CASE WHEN @ParentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ParentRunID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @AgentState_Clear = 1 THEN NULL ELSE ISNULL(@AgentState, NULL) END,
                CASE WHEN @TotalTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsed, 0) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, 0.000000) END,
                CASE WHEN @TotalPromptTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsed, NULL) END,
                CASE WHEN @TotalCompletionTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsed, NULL) END,
                CASE WHEN @TotalTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsedRollup, NULL) END,
                CASE WHEN @TotalPromptTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCompletionTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCostRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCostRollup, NULL) END,
                CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, NULL) END,
                CASE WHEN @ConversationDetailSequence_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailSequence, NULL) END,
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @FinalStep_Clear = 1 THEN NULL ELSE ISNULL(@FinalStep, NULL) END,
                CASE WHEN @FinalPayload_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayload, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @LastRunID_Clear = 1 THEN NULL ELSE ISNULL(@LastRunID, NULL) END,
                CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, NULL) END,
                ISNULL(@TotalPromptIterations, 0),
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                CASE WHEN @OverrideModelID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideModelID, NULL) END,
                CASE WHEN @OverrideVendorID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideVendorID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Verbose_Clear = 1 THEN NULL ELSE ISNULL(@Verbose, 0) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @TotalCacheReadTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheReadTokensUsed, NULL) END,
                CASE WHEN @TotalCacheWriteTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheWriteTokensUsed, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @ParentRunID_Clear bit = 0,
    @ParentRunID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @AgentState_Clear bit = 0,
    @AgentState nvarchar(MAX) = NULL,
    @TotalTokensUsed_Clear bit = 0,
    @TotalTokensUsed int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @TotalPromptTokensUsed_Clear bit = 0,
    @TotalPromptTokensUsed int = NULL,
    @TotalCompletionTokensUsed_Clear bit = 0,
    @TotalCompletionTokensUsed int = NULL,
    @TotalTokensUsedRollup_Clear bit = 0,
    @TotalTokensUsedRollup int = NULL,
    @TotalPromptTokensUsedRollup_Clear bit = 0,
    @TotalPromptTokensUsedRollup int = NULL,
    @TotalCompletionTokensUsedRollup_Clear bit = 0,
    @TotalCompletionTokensUsedRollup int = NULL,
    @TotalCostRollup_Clear bit = 0,
    @TotalCostRollup decimal(19, 8) = NULL,
    @ConversationDetailID_Clear bit = 0,
    @ConversationDetailID uniqueidentifier = NULL,
    @ConversationDetailSequence_Clear bit = 0,
    @ConversationDetailSequence int = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(30) = NULL,
    @FinalStep_Clear bit = 0,
    @FinalStep nvarchar(30) = NULL,
    @FinalPayload_Clear bit = 0,
    @FinalPayload nvarchar(MAX) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @LastRunID_Clear bit = 0,
    @LastRunID uniqueidentifier = NULL,
    @StartingPayload_Clear bit = 0,
    @StartingPayload nvarchar(MAX) = NULL,
    @TotalPromptIterations int = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @OverrideModelID_Clear bit = 0,
    @OverrideModelID uniqueidentifier = NULL,
    @OverrideVendorID_Clear bit = 0,
    @OverrideVendorID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Verbose_Clear bit = 0,
    @Verbose bit = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(200) = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @TotalCacheReadTokensUsed_Clear bit = 0,
    @TotalCacheReadTokensUsed int = NULL,
    @TotalCacheWriteTokensUsed_Clear bit = 0,
    @TotalCacheWriteTokensUsed int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [ParentRunID] = CASE WHEN @ParentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ParentRunID, [ParentRunID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [Success] = CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, [Success]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ConversationID] = CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, [ConversationID]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [Result] = CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, [Result]) END,
        [AgentState] = CASE WHEN @AgentState_Clear = 1 THEN NULL ELSE ISNULL(@AgentState, [AgentState]) END,
        [TotalTokensUsed] = CASE WHEN @TotalTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsed, [TotalTokensUsed]) END,
        [TotalCost] = CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, [TotalCost]) END,
        [TotalPromptTokensUsed] = CASE WHEN @TotalPromptTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsed, [TotalPromptTokensUsed]) END,
        [TotalCompletionTokensUsed] = CASE WHEN @TotalCompletionTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsed, [TotalCompletionTokensUsed]) END,
        [TotalTokensUsedRollup] = CASE WHEN @TotalTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsedRollup, [TotalTokensUsedRollup]) END,
        [TotalPromptTokensUsedRollup] = CASE WHEN @TotalPromptTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsedRollup, [TotalPromptTokensUsedRollup]) END,
        [TotalCompletionTokensUsedRollup] = CASE WHEN @TotalCompletionTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsedRollup, [TotalCompletionTokensUsedRollup]) END,
        [TotalCostRollup] = CASE WHEN @TotalCostRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCostRollup, [TotalCostRollup]) END,
        [ConversationDetailID] = CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, [ConversationDetailID]) END,
        [ConversationDetailSequence] = CASE WHEN @ConversationDetailSequence_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailSequence, [ConversationDetailSequence]) END,
        [CancellationReason] = CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, [CancellationReason]) END,
        [FinalStep] = CASE WHEN @FinalStep_Clear = 1 THEN NULL ELSE ISNULL(@FinalStep, [FinalStep]) END,
        [FinalPayload] = CASE WHEN @FinalPayload_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayload, [FinalPayload]) END,
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [LastRunID] = CASE WHEN @LastRunID_Clear = 1 THEN NULL ELSE ISNULL(@LastRunID, [LastRunID]) END,
        [StartingPayload] = CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, [StartingPayload]) END,
        [TotalPromptIterations] = ISNULL(@TotalPromptIterations, [TotalPromptIterations]),
        [ConfigurationID] = CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, [ConfigurationID]) END,
        [OverrideModelID] = CASE WHEN @OverrideModelID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideModelID, [OverrideModelID]) END,
        [OverrideVendorID] = CASE WHEN @OverrideVendorID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideVendorID, [OverrideVendorID]) END,
        [Data] = CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, [Data]) END,
        [Verbose] = CASE WHEN @Verbose_Clear = 1 THEN NULL ELSE ISNULL(@Verbose, [Verbose]) END,
        [EffortLevel] = CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, [EffortLevel]) END,
        [RunName] = CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, [RunName]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [ScheduledJobRunID] = CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, [ScheduledJobRunID]) END,
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [PrimaryScopeEntityID] = CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, [PrimaryScopeEntityID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [SecondaryScopes] = CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, [SecondaryScopes]) END,
        [ExternalReferenceID] = CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, [ExternalReferenceID]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [TotalCacheReadTokensUsed] = CASE WHEN @TotalCacheReadTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheReadTokensUsed, [TotalCacheReadTokensUsed]) END,
        [TotalCacheWriteTokensUsed] = CASE WHEN @TotalCacheWriteTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheWriteTokensUsed, [TotalCacheWriteTokensUsed]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRun
ON [${flyway:defaultSchema}].[AIAgentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceAIAgentRunIDID, @AgentID = @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @UserID = @MJAIAgentExamples_SourceAIAgentRunID_UserID, @CompanyID = @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @Type = @MJAIAgentExamples_SourceAIAgentRunID_Type, @ExampleInput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @Comments = @MJAIAgentExamples_SourceAIAgentRunID_Comments, @Status = @MJAIAgentExamples_SourceAIAgentRunID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore decimal(5, 2)
    DECLARE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceAIAgentRunIDID, @AgentID = @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceAIAgentRunID_Note, @UserID = @MJAIAgentNotes_SourceAIAgentRunID_UserID, @Type = @MJAIAgentNotes_SourceAIAgentRunID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceAIAgentRunID_Comments, @Status = @MJAIAgentNotes_SourceAIAgentRunID_Status, @SourceConversationID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @OriginatingAgentRunID_Clear = 1, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_ResumingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [ResumingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_ResumingAgentRunIDID, @AgentID = @MJAIAgentRequests_ResumingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_ResumingAgentRunID_Status, @Request = @MJAIAgentRequests_ResumingAgentRunID_Request, @Response = @MJAIAgentRequests_ResumingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_ResumingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_ResumingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID_Clear = 1, @ResumingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia
    DECLARE @MJAIAgentRunMedias_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunMedia]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] @ID = @MJAIAgentRunMedias_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] @ID = @MJAIAgentRunSteps_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ParentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ParentRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_Success bit
    DECLARE @MJAIAgentRuns_ParentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ParentRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ParentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Verbose bit
    DECLARE @MJAIAgentRuns_ParentRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_ParentRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ParentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ParentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed int
    DECLARE cascade_update_MJAIAgentRuns_ParentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ParentRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ParentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ParentRunID_ParentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ParentRunIDID, @AgentID = @MJAIAgentRuns_ParentRunID_AgentID, @ParentRunID_Clear = 1, @ParentRunID = @MJAIAgentRuns_ParentRunID_ParentRunID, @Status = @MJAIAgentRuns_ParentRunID_Status, @StartedAt = @MJAIAgentRuns_ParentRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_ParentRunID_CompletedAt, @Success = @MJAIAgentRuns_ParentRunID_Success, @ErrorMessage = @MJAIAgentRuns_ParentRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ParentRunID_ConversationID, @UserID = @MJAIAgentRuns_ParentRunID_UserID, @Result = @MJAIAgentRuns_ParentRunID_Result, @AgentState = @MJAIAgentRuns_ParentRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ParentRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ParentRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ParentRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ParentRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_ParentRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_ParentRunID_FinalPayload, @Message = @MJAIAgentRuns_ParentRunID_Message, @LastRunID = @MJAIAgentRuns_ParentRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_ParentRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ParentRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ParentRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ParentRunID_OverrideVendorID, @Data = @MJAIAgentRuns_ParentRunID_Data, @Verbose = @MJAIAgentRuns_ParentRunID_Verbose, @EffortLevel = @MJAIAgentRuns_ParentRunID_EffortLevel, @RunName = @MJAIAgentRuns_ParentRunID_RunName, @Comments = @MJAIAgentRuns_ParentRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ParentRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ParentRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ParentRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed
    END

    CLOSE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_LastRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_LastRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_Success bit
    DECLARE @MJAIAgentRuns_LastRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_LastRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_LastRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Verbose bit
    DECLARE @MJAIAgentRuns_LastRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_LastRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_LastRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_LastRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed int
    DECLARE cascade_update_MJAIAgentRuns_LastRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [LastRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_LastRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_LastRunID_LastRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_LastRunIDID, @AgentID = @MJAIAgentRuns_LastRunID_AgentID, @ParentRunID = @MJAIAgentRuns_LastRunID_ParentRunID, @Status = @MJAIAgentRuns_LastRunID_Status, @StartedAt = @MJAIAgentRuns_LastRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_LastRunID_CompletedAt, @Success = @MJAIAgentRuns_LastRunID_Success, @ErrorMessage = @MJAIAgentRuns_LastRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_LastRunID_ConversationID, @UserID = @MJAIAgentRuns_LastRunID_UserID, @Result = @MJAIAgentRuns_LastRunID_Result, @AgentState = @MJAIAgentRuns_LastRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_LastRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_LastRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_LastRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_LastRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_LastRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_LastRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_LastRunID_FinalPayload, @Message = @MJAIAgentRuns_LastRunID_Message, @LastRunID_Clear = 1, @LastRunID = @MJAIAgentRuns_LastRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_LastRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_LastRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_LastRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_LastRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_LastRunID_OverrideVendorID, @Data = @MJAIAgentRuns_LastRunID_Data, @Verbose = @MJAIAgentRuns_LastRunID_Verbose, @EffortLevel = @MJAIAgentRuns_LastRunID_EffortLevel, @RunName = @MJAIAgentRuns_LastRunID_RunName, @Comments = @MJAIAgentRuns_LastRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_LastRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_LastRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_LastRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_LastRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed
    END

    CLOSE cascade_update_MJAIAgentRuns_LastRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_LastRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_Success bit
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopK int
    DECLARE @MJAIPromptRuns_AgentRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_Seed int
    DECLARE @MJAIPromptRuns_AgentRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentRunID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentRunIDID, @PromptID = @MJAIPromptRuns_AgentRunID_PromptID, @ModelID = @MJAIPromptRuns_AgentRunID_ModelID, @VendorID = @MJAIPromptRuns_AgentRunID_VendorID, @AgentID = @MJAIPromptRuns_AgentRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentRunID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentRunID_Messages, @Result = @MJAIPromptRuns_AgentRunID_Result, @TokensUsed = @MJAIPromptRuns_AgentRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentRunID_TotalCost, @Success = @MJAIPromptRuns_AgentRunID_Success, @ErrorMessage = @MJAIPromptRuns_AgentRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentRunID_ParentID, @RunType = @MJAIPromptRuns_AgentRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentRunID_ExecutionOrder, @AgentRunID_Clear = 1, @AgentRunID = @MJAIPromptRuns_AgentRunID_AgentRunID, @Cost = @MJAIPromptRuns_AgentRunID_Cost, @CostCurrency = @MJAIPromptRuns_AgentRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentRunID_Temperature, @TopP = @MJAIPromptRuns_AgentRunID_TopP, @TopK = @MJAIPromptRuns_AgentRunID_TopK, @MinP = @MJAIPromptRuns_AgentRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentRunID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentRunID_Seed, @StopSequences = @MJAIPromptRuns_AgentRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentRunID_ModelSelection, @Status = @MJAIPromptRuns_AgentRunID_Status, @Cancelled = @MJAIPromptRuns_AgentRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentRunID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentRunID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentRunID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentRunID_EffortLevel, @RunName = @MJAIPromptRuns_AgentRunID_RunName, @Comments = @MJAIPromptRuns_AgentRunID_Comments, @TestRunID = @MJAIPromptRuns_AgentRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationDetailIDID, @AgentID = @MJAIAgentExamples_SourceConversationDetailID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationDetailID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationDetailID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationDetailID_Comments, @Status = @MJAIAgentExamples_SourceConversationDetailID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore decimal(5, 2)
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationDetailIDID, @AgentID = @MJAIAgentNotes_SourceConversationDetailID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationDetailID_Note, @UserID = @MJAIAgentNotes_SourceConversationDetailID_UserID, @Type = @MJAIAgentNotes_SourceConversationDetailID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationDetailID_Comments, @Status = @MJAIAgentNotes_SourceConversationDetailID_Status, @SourceConversationID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_Success bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationDetailID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationDetailID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed int
    DECLARE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationDetailIDID, @AgentID = @MJAIAgentRuns_ConversationDetailID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationDetailID_ParentRunID, @Status = @MJAIAgentRuns_ConversationDetailID_Status, @StartedAt = @MJAIAgentRuns_ConversationDetailID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationDetailID_CompletedAt, @Success = @MJAIAgentRuns_ConversationDetailID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ConversationDetailID_ConversationID, @UserID = @MJAIAgentRuns_ConversationDetailID_UserID, @Result = @MJAIAgentRuns_ConversationDetailID_Result, @AgentState = @MJAIAgentRuns_ConversationDetailID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationDetailID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationDetailID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationDetailID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationDetailID_FinalPayload, @Message = @MJAIAgentRuns_ConversationDetailID_Message, @LastRunID = @MJAIAgentRuns_ConversationDetailID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationDetailID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationDetailID_Data, @Verbose = @MJAIAgentRuns_ConversationDetailID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationDetailID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationDetailID_RunName, @Comments = @MJAIAgentRuns_ConversationDetailID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationDetailID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationDetailID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJConversationDetailArtifacts_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJConversationDetailArtifacts_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment
    DECLARE @MJConversationDetailAttachments_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailAttachment]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] @ID = @MJConversationDetailAttachments_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJConversationDetailRatings_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJConversationDetailRatings_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ParentIDID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ParentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_HiddenToUser bit
    DECLARE @MJConversationDetails_ParentID_UserRating int
    DECLARE @MJConversationDetails_ParentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_CompletionTime bigint
    DECLARE @MJConversationDetails_ParentID_IsPinned bit
    DECLARE @MJConversationDetails_ParentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_OriginalMessageChanged bit
    DECLARE cascade_update_MJConversationDetails_ParentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJConversationDetails_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ParentIDID, @ConversationID = @MJConversationDetails_ParentID_ConversationID, @ExternalID = @MJConversationDetails_ParentID_ExternalID, @Role = @MJConversationDetails_ParentID_Role, @Message = @MJConversationDetails_ParentID_Message, @Error = @MJConversationDetails_ParentID_Error, @HiddenToUser = @MJConversationDetails_ParentID_HiddenToUser, @UserRating = @MJConversationDetails_ParentID_UserRating, @UserFeedback = @MJConversationDetails_ParentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ParentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ParentID_UserID, @ArtifactID = @MJConversationDetails_ParentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_ParentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ParentID_CompletionTime, @IsPinned = @MJConversationDetails_ParentID_IsPinned, @ParentID_Clear = 1, @ParentID = @MJConversationDetails_ParentID_ParentID, @AgentID = @MJConversationDetails_ParentID_AgentID, @Status = @MJConversationDetails_ParentID_Status, @SuggestedResponses = @MJConversationDetails_ParentID_SuggestedResponses, @TestRunID = @MJConversationDetails_ParentID_TestRunID, @ResponseForm = @MJConversationDetails_ParentID_ResponseForm, @ActionableCommands = @MJConversationDetails_ParentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ParentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ParentID_OriginalMessageChanged

        FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged
    END

    CLOSE cascade_update_MJConversationDetails_ParentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ParentID_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @MJReports_ConversationDetailIDID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJReports_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_CategoryID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_SharingScope nvarchar(20)
    DECLARE @MJReports_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_DataContextID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Configuration nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_OutputTriggerTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputFormatTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputDeliveryTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputFrequency nvarchar(50)
    DECLARE @MJReports_ConversationDetailID_OutputTargetEmail nvarchar(255)
    DECLARE @MJReports_ConversationDetailID_OutputWorkflowID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Thumbnail nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE cascade_update_MJReports_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJReports_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJReports_ConversationDetailID_cursor INTO @MJReports_ConversationDetailIDID, @MJReports_ConversationDetailID_Name, @MJReports_ConversationDetailID_Description, @MJReports_ConversationDetailID_CategoryID, @MJReports_ConversationDetailID_UserID, @MJReports_ConversationDetailID_SharingScope, @MJReports_ConversationDetailID_ConversationID, @MJReports_ConversationDetailID_ConversationDetailID, @MJReports_ConversationDetailID_DataContextID, @MJReports_ConversationDetailID_Configuration, @MJReports_ConversationDetailID_OutputTriggerTypeID, @MJReports_ConversationDetailID_OutputFormatTypeID, @MJReports_ConversationDetailID_OutputDeliveryTypeID, @MJReports_ConversationDetailID_OutputFrequency, @MJReports_ConversationDetailID_OutputTargetEmail, @MJReports_ConversationDetailID_OutputWorkflowID, @MJReports_ConversationDetailID_Thumbnail, @MJReports_ConversationDetailID_EnvironmentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJReports_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @MJReports_ConversationDetailIDID, @Name = @MJReports_ConversationDetailID_Name, @Description = @MJReports_ConversationDetailID_Description, @CategoryID = @MJReports_ConversationDetailID_CategoryID, @UserID = @MJReports_ConversationDetailID_UserID, @SharingScope = @MJReports_ConversationDetailID_SharingScope, @ConversationID = @MJReports_ConversationDetailID_ConversationID, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJReports_ConversationDetailID_ConversationDetailID, @DataContextID = @MJReports_ConversationDetailID_DataContextID, @Configuration = @MJReports_ConversationDetailID_Configuration, @OutputTriggerTypeID = @MJReports_ConversationDetailID_OutputTriggerTypeID, @OutputFormatTypeID = @MJReports_ConversationDetailID_OutputFormatTypeID, @OutputDeliveryTypeID = @MJReports_ConversationDetailID_OutputDeliveryTypeID, @OutputFrequency = @MJReports_ConversationDetailID_OutputFrequency, @OutputTargetEmail = @MJReports_ConversationDetailID_OutputTargetEmail, @OutputWorkflowID = @MJReports_ConversationDetailID_OutputWorkflowID, @Thumbnail = @MJReports_ConversationDetailID_Thumbnail, @EnvironmentID = @MJReports_ConversationDetailID_EnvironmentID

        FETCH NEXT FROM cascade_update_MJReports_ConversationDetailID_cursor INTO @MJReports_ConversationDetailIDID, @MJReports_ConversationDetailID_Name, @MJReports_ConversationDetailID_Description, @MJReports_ConversationDetailID_CategoryID, @MJReports_ConversationDetailID_UserID, @MJReports_ConversationDetailID_SharingScope, @MJReports_ConversationDetailID_ConversationID, @MJReports_ConversationDetailID_ConversationDetailID, @MJReports_ConversationDetailID_DataContextID, @MJReports_ConversationDetailID_Configuration, @MJReports_ConversationDetailID_OutputTriggerTypeID, @MJReports_ConversationDetailID_OutputFormatTypeID, @MJReports_ConversationDetailID_OutputDeliveryTypeID, @MJReports_ConversationDetailID_OutputFrequency, @MJReports_ConversationDetailID_OutputTargetEmail, @MJReports_ConversationDetailID_OutputWorkflowID, @MJReports_ConversationDetailID_Thumbnail, @MJReports_ConversationDetailID_EnvironmentID
    END

    CLOSE cascade_update_MJReports_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJReports_ConversationDetailID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_ConversationDetailIDID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ParentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJTasks_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_TypeID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ProjectID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJTasks_ConversationDetailID_PercentComplete int
    DECLARE @MJTasks_ConversationDetailID_DueAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE cascade_update_MJTasks_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJTasks_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_ConversationDetailIDID, @ParentID = @MJTasks_ConversationDetailID_ParentID, @Name = @MJTasks_ConversationDetailID_Name, @Description = @MJTasks_ConversationDetailID_Description, @TypeID = @MJTasks_ConversationDetailID_TypeID, @EnvironmentID = @MJTasks_ConversationDetailID_EnvironmentID, @ProjectID = @MJTasks_ConversationDetailID_ProjectID, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJTasks_ConversationDetailID_ConversationDetailID, @UserID = @MJTasks_ConversationDetailID_UserID, @AgentID = @MJTasks_ConversationDetailID_AgentID, @Status = @MJTasks_ConversationDetailID_Status, @PercentComplete = @MJTasks_ConversationDetailID_PercentComplete, @DueAt = @MJTasks_ConversationDetailID_DueAt, @StartedAt = @MJTasks_ConversationDetailID_StartedAt, @CompletedAt = @MJTasks_ConversationDetailID_CompletedAt

        FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt
    END

    CLOSE cascade_update_MJTasks_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJTasks_ConversationDetailID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationID_cursor INTO @MJAIAgentExamples_SourceConversationIDID, @MJAIAgentExamples_SourceConversationID_AgentID, @MJAIAgentExamples_SourceConversationID_UserID, @MJAIAgentExamples_SourceConversationID_CompanyID, @MJAIAgentExamples_SourceConversationID_Type, @MJAIAgentExamples_SourceConversationID_ExampleInput, @MJAIAgentExamples_SourceConversationID_ExampleOutput, @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationID_SourceConversationID, @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationID_SuccessScore, @MJAIAgentExamples_SourceConversationID_Comments, @MJAIAgentExamples_SourceConversationID_Status, @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @MJAIAgentExamples_SourceConversationID_AccessCount, @MJAIAgentExamples_SourceConversationID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationID_SourceConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationIDID, @AgentID = @MJAIAgentExamples_SourceConversationID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @SourceConversationID_Clear = 1, @SourceConversationID = @MJAIAgentExamples_SourceConversationID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationID_Comments, @Status = @MJAIAgentExamples_SourceConversationID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationID_cursor INTO @MJAIAgentExamples_SourceConversationIDID, @MJAIAgentExamples_SourceConversationID_AgentID, @MJAIAgentExamples_SourceConversationID_UserID, @MJAIAgentExamples_SourceConversationID_CompanyID, @MJAIAgentExamples_SourceConversationID_Type, @MJAIAgentExamples_SourceConversationID_ExampleInput, @MJAIAgentExamples_SourceConversationID_ExampleOutput, @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationID_SourceConversationID, @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationID_SuccessScore, @MJAIAgentExamples_SourceConversationID_Comments, @MJAIAgentExamples_SourceConversationID_Status, @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @MJAIAgentExamples_SourceConversationID_AccessCount, @MJAIAgentExamples_SourceConversationID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_ImportanceScore decimal(5, 2)
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationID_SourceConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationIDID, @AgentID = @MJAIAgentNotes_SourceConversationID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationID_Note, @UserID = @MJAIAgentNotes_SourceConversationID_UserID, @Type = @MJAIAgentNotes_SourceConversationID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationID_Comments, @Status = @MJAIAgentNotes_SourceConversationID_Status, @SourceConversationID_Clear = 1, @SourceConversationID = @MJAIAgentNotes_SourceConversationID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_Success bit
    DECLARE @MJAIAgentRuns_ConversationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed int
    DECLARE cascade_update_MJAIAgentRuns_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationIDID, @AgentID = @MJAIAgentRuns_ConversationID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationID_ParentRunID, @Status = @MJAIAgentRuns_ConversationID_Status, @StartedAt = @MJAIAgentRuns_ConversationID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationID_CompletedAt, @Success = @MJAIAgentRuns_ConversationID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationID_ErrorMessage, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentRuns_ConversationID_ConversationID, @UserID = @MJAIAgentRuns_ConversationID_UserID, @Result = @MJAIAgentRuns_ConversationID_Result, @AgentState = @MJAIAgentRuns_ConversationID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConversationID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationID_FinalPayload, @Message = @MJAIAgentRuns_ConversationID_Message, @LastRunID = @MJAIAgentRuns_ConversationID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationID_Data, @Verbose = @MJAIAgentRuns_ConversationID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationID_RunName, @Comments = @MJAIAgentRuns_ConversationID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationID_cursor
    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact
    DECLARE @MJConversationArtifacts_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationArtifacts_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifact]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationArtifacts_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationArtifacts_ConversationID_cursor INTO @MJConversationArtifacts_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifact] @ID = @MJConversationArtifacts_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationArtifacts_ConversationID_cursor INTO @MJConversationArtifacts_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationArtifacts_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationArtifacts_ConversationID_cursor
    
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail
    DECLARE @MJConversationDetails_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetails_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationDetails_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetails_ConversationID_cursor INTO @MJConversationDetails_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetail] @ID = @MJConversationDetails_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetails_ConversationID_cursor INTO @MJConversationDetails_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationDetails_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationDetails_ConversationID_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @MJReports_ConversationIDID uniqueidentifier
    DECLARE @MJReports_ConversationID_Name nvarchar(255)
    DECLARE @MJReports_ConversationID_Description nvarchar(MAX)
    DECLARE @MJReports_ConversationID_CategoryID uniqueidentifier
    DECLARE @MJReports_ConversationID_UserID uniqueidentifier
    DECLARE @MJReports_ConversationID_SharingScope nvarchar(20)
    DECLARE @MJReports_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJReports_ConversationID_ConversationDetailID uniqueidentifier
    DECLARE @MJReports_ConversationID_DataContextID uniqueidentifier
    DECLARE @MJReports_ConversationID_Configuration nvarchar(MAX)
    DECLARE @MJReports_ConversationID_OutputTriggerTypeID uniqueidentifier
    DECLARE @MJReports_ConversationID_OutputFormatTypeID uniqueidentifier
    DECLARE @MJReports_ConversationID_OutputDeliveryTypeID uniqueidentifier
    DECLARE @MJReports_ConversationID_OutputFrequency nvarchar(50)
    DECLARE @MJReports_ConversationID_OutputTargetEmail nvarchar(255)
    DECLARE @MJReports_ConversationID_OutputWorkflowID uniqueidentifier
    DECLARE @MJReports_ConversationID_Thumbnail nvarchar(MAX)
    DECLARE @MJReports_ConversationID_EnvironmentID uniqueidentifier
    DECLARE cascade_update_MJReports_ConversationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJReports_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJReports_ConversationID_cursor INTO @MJReports_ConversationIDID, @MJReports_ConversationID_Name, @MJReports_ConversationID_Description, @MJReports_ConversationID_CategoryID, @MJReports_ConversationID_UserID, @MJReports_ConversationID_SharingScope, @MJReports_ConversationID_ConversationID, @MJReports_ConversationID_ConversationDetailID, @MJReports_ConversationID_DataContextID, @MJReports_ConversationID_Configuration, @MJReports_ConversationID_OutputTriggerTypeID, @MJReports_ConversationID_OutputFormatTypeID, @MJReports_ConversationID_OutputDeliveryTypeID, @MJReports_ConversationID_OutputFrequency, @MJReports_ConversationID_OutputTargetEmail, @MJReports_ConversationID_OutputWorkflowID, @MJReports_ConversationID_Thumbnail, @MJReports_ConversationID_EnvironmentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJReports_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @MJReports_ConversationIDID, @Name = @MJReports_ConversationID_Name, @Description = @MJReports_ConversationID_Description, @CategoryID = @MJReports_ConversationID_CategoryID, @UserID = @MJReports_ConversationID_UserID, @SharingScope = @MJReports_ConversationID_SharingScope, @ConversationID_Clear = 1, @ConversationID = @MJReports_ConversationID_ConversationID, @ConversationDetailID = @MJReports_ConversationID_ConversationDetailID, @DataContextID = @MJReports_ConversationID_DataContextID, @Configuration = @MJReports_ConversationID_Configuration, @OutputTriggerTypeID = @MJReports_ConversationID_OutputTriggerTypeID, @OutputFormatTypeID = @MJReports_ConversationID_OutputFormatTypeID, @OutputDeliveryTypeID = @MJReports_ConversationID_OutputDeliveryTypeID, @OutputFrequency = @MJReports_ConversationID_OutputFrequency, @OutputTargetEmail = @MJReports_ConversationID_OutputTargetEmail, @OutputWorkflowID = @MJReports_ConversationID_OutputWorkflowID, @Thumbnail = @MJReports_ConversationID_Thumbnail, @EnvironmentID = @MJReports_ConversationID_EnvironmentID

        FETCH NEXT FROM cascade_update_MJReports_ConversationID_cursor INTO @MJReports_ConversationIDID, @MJReports_ConversationID_Name, @MJReports_ConversationID_Description, @MJReports_ConversationID_CategoryID, @MJReports_ConversationID_UserID, @MJReports_ConversationID_SharingScope, @MJReports_ConversationID_ConversationID, @MJReports_ConversationID_ConversationDetailID, @MJReports_ConversationID_DataContextID, @MJReports_ConversationID_Configuration, @MJReports_ConversationID_OutputTriggerTypeID, @MJReports_ConversationID_OutputFormatTypeID, @MJReports_ConversationID_OutputDeliveryTypeID, @MJReports_ConversationID_OutputFrequency, @MJReports_ConversationID_OutputTargetEmail, @MJReports_ConversationID_OutputWorkflowID, @MJReports_ConversationID_Thumbnail, @MJReports_ConversationID_EnvironmentID
    END

    CLOSE cascade_update_MJReports_ConversationID_cursor
    DEALLOCATE cascade_update_MJReports_ConversationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Conversation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_CreatedByAgentIDID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CategoryID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Name nvarchar(425)
    DECLARE @MJActions_CreatedByAgentID_Description nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Type nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_UserComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Code nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_CreatedByAgentID_CodeLocked bit
    DECLARE @MJActions_CreatedByAgentID_ForceCodeGeneration bit
    DECLARE @MJActions_CreatedByAgentID_RetentionPeriod int
    DECLARE @MJActions_CreatedByAgentID_Status nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_DriverClass nvarchar(255)
    DECLARE @MJActions_CreatedByAgentID_ParentID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_IconClass nvarchar(100)
    DECLARE @MJActions_CreatedByAgentID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Config nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_MaxExecutionTimeMS int
    DECLARE @MJActions_CreatedByAgentID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_CreatedByAgentID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [CreatedByAgentID] = @ID

    OPEN cascade_update_MJActions_CreatedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_CreatedByAgentID_CreatedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_CreatedByAgentIDID, @CategoryID = @MJActions_CreatedByAgentID_CategoryID, @Name = @MJActions_CreatedByAgentID_Name, @Description = @MJActions_CreatedByAgentID_Description, @Type = @MJActions_CreatedByAgentID_Type, @UserPrompt = @MJActions_CreatedByAgentID_UserPrompt, @UserComments = @MJActions_CreatedByAgentID_UserComments, @Code = @MJActions_CreatedByAgentID_Code, @CodeComments = @MJActions_CreatedByAgentID_CodeComments, @CodeApprovalStatus = @MJActions_CreatedByAgentID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_CreatedByAgentID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_CreatedByAgentID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_CreatedByAgentID_CodeApprovedAt, @CodeLocked = @MJActions_CreatedByAgentID_CodeLocked, @ForceCodeGeneration = @MJActions_CreatedByAgentID_ForceCodeGeneration, @RetentionPeriod = @MJActions_CreatedByAgentID_RetentionPeriod, @Status = @MJActions_CreatedByAgentID_Status, @DriverClass = @MJActions_CreatedByAgentID_DriverClass, @ParentID = @MJActions_CreatedByAgentID_ParentID, @IconClass = @MJActions_CreatedByAgentID_IconClass, @DefaultCompactPromptID = @MJActions_CreatedByAgentID_DefaultCompactPromptID, @Config = @MJActions_CreatedByAgentID_Config, @RuntimeActionConfiguration = @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @CreatedByAgentID_Clear = 1, @CreatedByAgentID = @MJActions_CreatedByAgentID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_CreatedByAgentID_cursor
    DEALLOCATE cascade_update_MJActions_CreatedByAgentID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_AgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactLength int
    DECLARE @MJAIAgentActions_AgentID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentActions_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentActions_AgentID_AgentID, @ActionID = @MJAIAgentActions_AgentID_ActionID, @Status = @MJAIAgentActions_AgentID_Status, @MinExecutionsPerRun = @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_AgentID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_AgentID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_AgentID_CompactMode, @CompactLength = @MJAIAgentActions_AgentID_CompactLength, @CompactPromptID = @MJAIAgentActions_AgentID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_AgentID_cursor
    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType
    DECLARE @MJAIAgentArtifactTypes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentArtifactType]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] @ID = @MJAIAgentArtifactTypes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool
    DECLARE @MJAIAgentClientTools_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentClientTools_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentClientTool]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentClientTools_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentClientTool] @ID = @MJAIAgentClientTools_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentConfigurations_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource
    DECLARE @MJAIAgentDataSources_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentDataSources_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentDataSource]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentDataSources_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] @ID = @MJAIAgentDataSources_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample
    DECLARE @MJAIAgentExamples_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentExamples_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentExamples_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentExample] @ID = @MJAIAgentExamples_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentExamples_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentExamples_AgentID_cursor
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle
    DECLARE @MJAIAgentLearningCycles_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentLearningCycle]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] @ID = @MJAIAgentLearningCycles_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality
    DECLARE @MJAIAgentModalities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentModalities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentModality]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentModalities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentModality] @ID = @MJAIAgentModalities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentModalities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentModalities_AgentID_cursor
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel
    DECLARE @MJAIAgentModels_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_Active bit
    DECLARE @MJAIAgentModels_AgentID_Priority int
    DECLARE cascade_update_MJAIAgentModels_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ModelID], [Active], [Priority]
        FROM [${flyway:defaultSchema}].[AIAgentModel]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentModels_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentModels_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentModel] @ID = @MJAIAgentModels_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentModels_AgentID_AgentID, @ModelID = @MJAIAgentModels_AgentID_ModelID, @Active = @MJAIAgentModels_AgentID_Active, @Priority = @MJAIAgentModels_AgentID_Priority

        FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority
    END

    CLOSE cascade_update_MJAIAgentModels_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentModels_AgentID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_AgentID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_AccessCount int
    DECLARE @MJAIAgentNotes_AgentID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_AgentID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_ImportanceScore decimal(5, 2)
    DECLARE cascade_update_MJAIAgentNotes_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentNotes_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentNotes_AgentID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_AgentID_AgentNoteTypeID, @Note = @MJAIAgentNotes_AgentID_Note, @UserID = @MJAIAgentNotes_AgentID_UserID, @Type = @MJAIAgentNotes_AgentID_Type, @IsAutoGenerated = @MJAIAgentNotes_AgentID_IsAutoGenerated, @Comments = @MJAIAgentNotes_AgentID_Comments, @Status = @MJAIAgentNotes_AgentID_Status, @SourceConversationID = @MJAIAgentNotes_AgentID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_AgentID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_AgentID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_AgentID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_AgentID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_AgentID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_AgentID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_AgentID_AccessCount, @ExpiresAt = @MJAIAgentNotes_AgentID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_AgentID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_AgentID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_AgentID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore
    END

    CLOSE cascade_update_MJAIAgentNotes_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_AgentID_cursor
    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission
    DECLARE @MJAIAgentPermissions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPermissions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPermission]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPermissions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPermission] @ID = @MJAIAgentPermissions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest
    DECLARE @MJAIAgentRequests_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRequests_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRequests_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRequest] @ID = @MJAIAgentRequests_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRequests_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRequests_AgentID_cursor
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun
    DECLARE @MJAIAgentRuns_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRuns_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRuns_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRun] @ID = @MJAIAgentRuns_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRuns_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRuns_AgentID_cursor
    
    -- Cascade delete from AIAgentSearchScope using cursor to call spDeleteAIAgentSearchScope
    DECLARE @MJAIAgentSearchScopes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSearchScope]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope] @ID = @MJAIAgentSearchScopes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep
    DECLARE @MJAIAgentSteps_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSteps_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSteps_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentStep] @ID = @MJAIAgentSteps_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSteps_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSteps_AgentID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_SubAgentIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_SubAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_StartingStep bit
    DECLARE @MJAIAgentSteps_SubAgentID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_SubAgentID_RetryCount int
    DECLARE @MJAIAgentSteps_SubAgentID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_PositionX int
    DECLARE @MJAIAgentSteps_SubAgentID_PositionY int
    DECLARE @MJAIAgentSteps_SubAgentID_Width int
    DECLARE @MJAIAgentSteps_SubAgentID_Height int
    DECLARE @MJAIAgentSteps_SubAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_SubAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_SubAgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [SubAgentID] = @ID

    OPEN cascade_update_MJAIAgentSteps_SubAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_SubAgentID_SubAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_SubAgentIDID, @AgentID = @MJAIAgentSteps_SubAgentID_AgentID, @Name = @MJAIAgentSteps_SubAgentID_Name, @Description = @MJAIAgentSteps_SubAgentID_Description, @StepType = @MJAIAgentSteps_SubAgentID_StepType, @StartingStep = @MJAIAgentSteps_SubAgentID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_SubAgentID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_SubAgentID_ActionID, @SubAgentID_Clear = 1, @SubAgentID = @MJAIAgentSteps_SubAgentID_SubAgentID, @PromptID = @MJAIAgentSteps_SubAgentID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_SubAgentID_PositionX, @PositionY = @MJAIAgentSteps_SubAgentID_PositionY, @Width = @MJAIAgentSteps_SubAgentID_Width, @Height = @MJAIAgentSteps_SubAgentID_Height, @Status = @MJAIAgentSteps_SubAgentID_Status, @ActionInputMapping = @MJAIAgentSteps_SubAgentID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_SubAgentID_LoopBodyType, @Configuration = @MJAIAgentSteps_SubAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ParentIDID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Name nvarchar(255)
    DECLARE @MJAIAgents_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ExposeAsAction bit
    DECLARE @MJAIAgents_ParentID_ExecutionOrder int
    DECLARE @MJAIAgents_ParentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_EnableContextCompression bit
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ParentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ParentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Status nvarchar(20)
    DECLARE @MJAIAgents_ParentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ParentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ParentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ParentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ParentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ParentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxTimePerRun int
    DECLARE @MJAIAgents_ParentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ParentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ParentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_InjectNotes bit
    DECLARE @MJAIAgents_ParentID_MaxNotesToInject int
    DECLARE @MJAIAgents_ParentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_InjectExamples bit
    DECLARE @MJAIAgents_ParentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ParentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_IsRestricted bit
    DECLARE @MJAIAgents_ParentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_MaxMessages int
    DECLARE @MJAIAgents_ParentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ParentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ParentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_NoteRetentionDays int
    DECLARE @MJAIAgents_ParentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ParentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ParentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ParentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ParentID_AcceptUnregisteredFiles bit
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles
    END

    CLOSE cascade_update_MJAIAgents_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_Success bit
    DECLARE @MJAIPromptRuns_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopK int
    DECLARE @MJAIPromptRuns_AgentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_Seed int
    DECLARE @MJAIPromptRuns_AgentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_AgentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_AgentRunID, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentIDID, @PromptID = @MJAIPromptRuns_AgentID_PromptID, @ModelID = @MJAIPromptRuns_AgentID_ModelID, @VendorID = @MJAIPromptRuns_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIPromptRuns_AgentID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentID_Messages, @Result = @MJAIPromptRuns_AgentID_Result, @TokensUsed = @MJAIPromptRuns_AgentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentID_TotalCost, @Success = @MJAIPromptRuns_AgentID_Success, @ErrorMessage = @MJAIPromptRuns_AgentID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentID_ParentID, @RunType = @MJAIPromptRuns_AgentID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_AgentID_AgentRunID, @Cost = @MJAIPromptRuns_AgentID_Cost, @CostCurrency = @MJAIPromptRuns_AgentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentID_Temperature, @TopP = @MJAIPromptRuns_AgentID_TopP, @TopK = @MJAIPromptRuns_AgentID_TopK, @MinP = @MJAIPromptRuns_AgentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentID_Seed, @StopSequences = @MJAIPromptRuns_AgentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentID_ModelSelection, @Status = @MJAIPromptRuns_AgentID_Status, @Cancelled = @MJAIPromptRuns_AgentID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentID_EffortLevel, @RunName = @MJAIPromptRuns_AgentID_RunName, @Comments = @MJAIPromptRuns_AgentID_Comments, @TestRunID = @MJAIPromptRuns_AgentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_AgentRunID, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_AgentIDID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_AgentID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_Status nvarchar(50)
    DECLARE @MJAIResultCache_AgentID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_AgentID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_AgentID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIResultCache_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_AgentIDID, @AIPromptID = @MJAIResultCache_AgentID_AIPromptID, @AIModelID = @MJAIResultCache_AgentID_AIModelID, @RunAt = @MJAIResultCache_AgentID_RunAt, @PromptText = @MJAIResultCache_AgentID_PromptText, @ResultText = @MJAIResultCache_AgentID_ResultText, @Status = @MJAIResultCache_AgentID_Status, @ExpiredOn = @MJAIResultCache_AgentID_ExpiredOn, @VendorID = @MJAIResultCache_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIResultCache_AgentID_AgentID, @ConfigurationID = @MJAIResultCache_AgentID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_AgentID_PromptEmbedding, @PromptRunID = @MJAIResultCache_AgentID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_AgentID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_AgentID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_AgentIDID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_AgentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_HiddenToUser bit
    DECLARE @MJConversationDetails_AgentID_UserRating int
    DECLARE @MJConversationDetails_AgentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_CompletionTime bigint
    DECLARE @MJConversationDetails_AgentID_IsPinned bit
    DECLARE @MJConversationDetails_AgentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_OriginalMessageChanged bit
    DECLARE cascade_update_MJConversationDetails_AgentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJConversationDetails_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_AgentIDID, @ConversationID = @MJConversationDetails_AgentID_ConversationID, @ExternalID = @MJConversationDetails_AgentID_ExternalID, @Role = @MJConversationDetails_AgentID_Role, @Message = @MJConversationDetails_AgentID_Message, @Error = @MJConversationDetails_AgentID_Error, @HiddenToUser = @MJConversationDetails_AgentID_HiddenToUser, @UserRating = @MJConversationDetails_AgentID_UserRating, @UserFeedback = @MJConversationDetails_AgentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_AgentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_AgentID_UserID, @ArtifactID = @MJConversationDetails_AgentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_AgentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_AgentID_CompletionTime, @IsPinned = @MJConversationDetails_AgentID_IsPinned, @ParentID = @MJConversationDetails_AgentID_ParentID, @AgentID_Clear = 1, @AgentID = @MJConversationDetails_AgentID_AgentID, @Status = @MJConversationDetails_AgentID_Status, @SuggestedResponses = @MJConversationDetails_AgentID_SuggestedResponses, @TestRunID = @MJConversationDetails_AgentID_TestRunID, @ResponseForm = @MJConversationDetails_AgentID_ResponseForm, @ActionableCommands = @MJConversationDetails_AgentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_AgentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_AgentID_OriginalMessageChanged

        FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged
    END

    CLOSE cascade_update_MJConversationDetails_AgentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_AgentID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_DefaultAgentIDID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_UserID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ExternalID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_Name nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_Description nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_Type nvarchar(50)
    DECLARE @MJConversations_DefaultAgentID_IsArchived bit
    DECLARE @MJConversations_DefaultAgentID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_DataContextID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_Status nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ProjectID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_IsPinned bit
    DECLARE @MJConversations_DefaultAgentID_TestRunID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_AdditionalData nvarchar(MAX)
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @Type = @MJConversations_DefaultAgentID_Type, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData
    END

    CLOSE cascade_update_MJConversations_DefaultAgentID_cursor
    DEALLOCATE cascade_update_MJConversations_DefaultAgentID_cursor
    
    -- Cascade update on SearchExecutionLog using cursor to call spUpdateSearchExecutionLog
    DECLARE @MJSearchExecutionLogs_AIAgentIDID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_SearchScopeID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_UserID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_AIAgentID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_Query nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_TotalDurationMs int
    DECLARE @MJSearchExecutionLogs_AIAgentID_ResultCount int
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerName nvarchar(100)
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerCostCents decimal(10, 4)
    DECLARE @MJSearchExecutionLogs_AIAgentID_Status nvarchar(20)
    DECLARE @MJSearchExecutionLogs_AIAgentID_FailureReason nvarchar(500)
    DECLARE @MJSearchExecutionLogs_AIAgentID_ProvidersJSON nvarchar(MAX)
    DECLARE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor CURSOR FOR
        SELECT [ID], [SearchScopeID], [UserID], [AIAgentID], [Query], [TotalDurationMs], [ResultCount], [RerankerName], [RerankerCostCents], [Status], [FailureReason], [ProvidersJSON]
        FROM [${flyway:defaultSchema}].[SearchExecutionLog]
        WHERE [AIAgentID] = @ID

    OPEN cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJSearchExecutionLogs_AIAgentID_AIAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] @ID = @MJSearchExecutionLogs_AIAgentIDID, @SearchScopeID = @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @UserID = @MJSearchExecutionLogs_AIAgentID_UserID, @AIAgentID_Clear = 1, @AIAgentID = @MJSearchExecutionLogs_AIAgentID_AIAgentID, @Query = @MJSearchExecutionLogs_AIAgentID_Query, @TotalDurationMs = @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @ResultCount = @MJSearchExecutionLogs_AIAgentID_ResultCount, @RerankerName = @MJSearchExecutionLogs_AIAgentID_RerankerName, @RerankerCostCents = @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @Status = @MJSearchExecutionLogs_AIAgentID_Status, @FailureReason = @MJSearchExecutionLogs_AIAgentID_FailureReason, @ProvidersJSON = @MJSearchExecutionLogs_AIAgentID_ProvidersJSON

        FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON
    END

    CLOSE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    DEALLOCATE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentIDID uniqueidentifier
    DECLARE @MJTasks_AgentID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Name nvarchar(255)
    DECLARE @MJTasks_AgentID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Status nvarchar(50)
    DECLARE @MJTasks_AgentID_PercentComplete int
    DECLARE @MJTasks_AgentID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentID_CompletedAt datetimeoffset
    DECLARE cascade_update_MJTasks_AgentID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJTasks_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentIDID, @ParentID = @MJTasks_AgentID_ParentID, @Name = @MJTasks_AgentID_Name, @Description = @MJTasks_AgentID_Description, @TypeID = @MJTasks_AgentID_TypeID, @EnvironmentID = @MJTasks_AgentID_EnvironmentID, @ProjectID = @MJTasks_AgentID_ProjectID, @ConversationDetailID = @MJTasks_AgentID_ConversationDetailID, @UserID = @MJTasks_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJTasks_AgentID_AgentID, @Status = @MJTasks_AgentID_Status, @PercentComplete = @MJTasks_AgentID_PercentComplete, @DueAt = @MJTasks_AgentID_DueAt, @StartedAt = @MJTasks_AgentID_StartedAt, @CompletedAt = @MJTasks_AgentID_CompletedAt

        FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt
    END

    CLOSE cascade_update_MJTasks_AgentID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentConfiguration using cursor to call spUpdateAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AIConfigurationIDID uniqueidentifier
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Name nvarchar(100)
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_DisplayName nvarchar(200)
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Description nvarchar(MAX)
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID uniqueidentifier
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_IsDefault bit
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Priority int
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Status nvarchar(20)
    DECLARE cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [DisplayName], [Description], [AIConfigurationID], [IsDefault], [Priority], [Status]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AIConfigurationID] = @ID

    OPEN cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor INTO @MJAIAgentConfigurations_AIConfigurationIDID, @MJAIAgentConfigurations_AIConfigurationID_AgentID, @MJAIAgentConfigurations_AIConfigurationID_Name, @MJAIAgentConfigurations_AIConfigurationID_DisplayName, @MJAIAgentConfigurations_AIConfigurationID_Description, @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, @MJAIAgentConfigurations_AIConfigurationID_IsDefault, @MJAIAgentConfigurations_AIConfigurationID_Priority, @MJAIAgentConfigurations_AIConfigurationID_Status

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AIConfigurationIDID, @AgentID = @MJAIAgentConfigurations_AIConfigurationID_AgentID, @Name = @MJAIAgentConfigurations_AIConfigurationID_Name, @DisplayName = @MJAIAgentConfigurations_AIConfigurationID_DisplayName, @Description = @MJAIAgentConfigurations_AIConfigurationID_Description, @AIConfigurationID_Clear = 1, @AIConfigurationID = @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, @IsDefault = @MJAIAgentConfigurations_AIConfigurationID_IsDefault, @Priority = @MJAIAgentConfigurations_AIConfigurationID_Priority, @Status = @MJAIAgentConfigurations_AIConfigurationID_Status

        FETCH NEXT FROM cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor INTO @MJAIAgentConfigurations_AIConfigurationIDID, @MJAIAgentConfigurations_AIConfigurationID_AgentID, @MJAIAgentConfigurations_AIConfigurationID_Name, @MJAIAgentConfigurations_AIConfigurationID_DisplayName, @MJAIAgentConfigurations_AIConfigurationID_Description, @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, @MJAIAgentConfigurations_AIConfigurationID_IsDefault, @MJAIAgentConfigurations_AIConfigurationID_Priority, @MJAIAgentConfigurations_AIConfigurationID_Status
    END

    CLOSE cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_ConfigurationIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [ConfigurationID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor INTO @MJAIAgentPrompts_ConfigurationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_ConfigurationIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor INTO @MJAIAgentPrompts_ConfigurationIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConfigurationIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConfigurationID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConfigurationID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConfigurationID_Success bit
    DECLARE @MJAIAgentRuns_ConfigurationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConfigurationID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConfigurationID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConfigurationID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConfigurationID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConfigurationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_Verbose bit
    DECLARE @MJAIAgentRuns_ConfigurationID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConfigurationID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConfigurationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConfigurationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConfigurationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed int
    DECLARE cascade_update_MJAIAgentRuns_ConfigurationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConfigurationID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConfigurationID_cursor INTO @MJAIAgentRuns_ConfigurationIDID, @MJAIAgentRuns_ConfigurationID_AgentID, @MJAIAgentRuns_ConfigurationID_ParentRunID, @MJAIAgentRuns_ConfigurationID_Status, @MJAIAgentRuns_ConfigurationID_StartedAt, @MJAIAgentRuns_ConfigurationID_CompletedAt, @MJAIAgentRuns_ConfigurationID_Success, @MJAIAgentRuns_ConfigurationID_ErrorMessage, @MJAIAgentRuns_ConfigurationID_ConversationID, @MJAIAgentRuns_ConfigurationID_UserID, @MJAIAgentRuns_ConfigurationID_Result, @MJAIAgentRuns_ConfigurationID_AgentState, @MJAIAgentRuns_ConfigurationID_TotalTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCost, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCostRollup, @MJAIAgentRuns_ConfigurationID_ConversationDetailID, @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, @MJAIAgentRuns_ConfigurationID_CancellationReason, @MJAIAgentRuns_ConfigurationID_FinalStep, @MJAIAgentRuns_ConfigurationID_FinalPayload, @MJAIAgentRuns_ConfigurationID_Message, @MJAIAgentRuns_ConfigurationID_LastRunID, @MJAIAgentRuns_ConfigurationID_StartingPayload, @MJAIAgentRuns_ConfigurationID_TotalPromptIterations, @MJAIAgentRuns_ConfigurationID_ConfigurationID, @MJAIAgentRuns_ConfigurationID_OverrideModelID, @MJAIAgentRuns_ConfigurationID_OverrideVendorID, @MJAIAgentRuns_ConfigurationID_Data, @MJAIAgentRuns_ConfigurationID_Verbose, @MJAIAgentRuns_ConfigurationID_EffortLevel, @MJAIAgentRuns_ConfigurationID_RunName, @MJAIAgentRuns_ConfigurationID_Comments, @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, @MJAIAgentRuns_ConfigurationID_TestRunID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConfigurationID_SecondaryScopes, @MJAIAgentRuns_ConfigurationID_ExternalReferenceID, @MJAIAgentRuns_ConfigurationID_CompanyID, @MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConfigurationID_ConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConfigurationIDID, @AgentID = @MJAIAgentRuns_ConfigurationID_AgentID, @ParentRunID = @MJAIAgentRuns_ConfigurationID_ParentRunID, @Status = @MJAIAgentRuns_ConfigurationID_Status, @StartedAt = @MJAIAgentRuns_ConfigurationID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConfigurationID_CompletedAt, @Success = @MJAIAgentRuns_ConfigurationID_Success, @ErrorMessage = @MJAIAgentRuns_ConfigurationID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ConfigurationID_ConversationID, @UserID = @MJAIAgentRuns_ConfigurationID_UserID, @Result = @MJAIAgentRuns_ConfigurationID_Result, @AgentState = @MJAIAgentRuns_ConfigurationID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConfigurationID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConfigurationID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConfigurationID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConfigurationID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConfigurationID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConfigurationID_FinalPayload, @Message = @MJAIAgentRuns_ConfigurationID_Message, @LastRunID = @MJAIAgentRuns_ConfigurationID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConfigurationID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConfigurationID_TotalPromptIterations, @ConfigurationID_Clear = 1, @ConfigurationID = @MJAIAgentRuns_ConfigurationID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConfigurationID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConfigurationID_OverrideVendorID, @Data = @MJAIAgentRuns_ConfigurationID_Data, @Verbose = @MJAIAgentRuns_ConfigurationID_Verbose, @EffortLevel = @MJAIAgentRuns_ConfigurationID_EffortLevel, @RunName = @MJAIAgentRuns_ConfigurationID_RunName, @Comments = @MJAIAgentRuns_ConfigurationID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConfigurationID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConfigurationID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConfigurationID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConfigurationID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConfigurationID_cursor INTO @MJAIAgentRuns_ConfigurationIDID, @MJAIAgentRuns_ConfigurationID_AgentID, @MJAIAgentRuns_ConfigurationID_ParentRunID, @MJAIAgentRuns_ConfigurationID_Status, @MJAIAgentRuns_ConfigurationID_StartedAt, @MJAIAgentRuns_ConfigurationID_CompletedAt, @MJAIAgentRuns_ConfigurationID_Success, @MJAIAgentRuns_ConfigurationID_ErrorMessage, @MJAIAgentRuns_ConfigurationID_ConversationID, @MJAIAgentRuns_ConfigurationID_UserID, @MJAIAgentRuns_ConfigurationID_Result, @MJAIAgentRuns_ConfigurationID_AgentState, @MJAIAgentRuns_ConfigurationID_TotalTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCost, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCostRollup, @MJAIAgentRuns_ConfigurationID_ConversationDetailID, @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, @MJAIAgentRuns_ConfigurationID_CancellationReason, @MJAIAgentRuns_ConfigurationID_FinalStep, @MJAIAgentRuns_ConfigurationID_FinalPayload, @MJAIAgentRuns_ConfigurationID_Message, @MJAIAgentRuns_ConfigurationID_LastRunID, @MJAIAgentRuns_ConfigurationID_StartingPayload, @MJAIAgentRuns_ConfigurationID_TotalPromptIterations, @MJAIAgentRuns_ConfigurationID_ConfigurationID, @MJAIAgentRuns_ConfigurationID_OverrideModelID, @MJAIAgentRuns_ConfigurationID_OverrideVendorID, @MJAIAgentRuns_ConfigurationID_Data, @MJAIAgentRuns_ConfigurationID_Verbose, @MJAIAgentRuns_ConfigurationID_EffortLevel, @MJAIAgentRuns_ConfigurationID_RunName, @MJAIAgentRuns_ConfigurationID_Comments, @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, @MJAIAgentRuns_ConfigurationID_TestRunID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConfigurationID_SecondaryScopes, @MJAIAgentRuns_ConfigurationID_ExternalReferenceID, @MJAIAgentRuns_ConfigurationID_CompanyID, @MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed
    END

    CLOSE cascade_update_MJAIAgentRuns_ConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConfigurationID_cursor
    
    -- Cascade delete from AIConfigurationParam using cursor to call spDeleteAIConfigurationParam
    DECLARE @MJAIConfigurationParams_ConfigurationIDID uniqueidentifier
    DECLARE cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIConfigurationParam]
        WHERE [ConfigurationID] = @ID
    
    OPEN cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor
    FETCH NEXT FROM cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor INTO @MJAIConfigurationParams_ConfigurationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIConfigurationParam] @ID = @MJAIConfigurationParams_ConfigurationIDID
        
        FETCH NEXT FROM cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor INTO @MJAIConfigurationParams_ConfigurationIDID
    END
    
    CLOSE cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor
    DEALLOCATE cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_ParentIDID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_ParentID_IsDefault bit
    DECLARE @MJAIConfigurations_ParentID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_ParentID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIConfigurations_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_ParentID_cursor INTO @MJAIConfigurations_ParentIDID, @MJAIConfigurations_ParentID_Name, @MJAIConfigurations_ParentID_Description, @MJAIConfigurations_ParentID_IsDefault, @MJAIConfigurations_ParentID_Status, @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID, @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_ParentID_DefaultStorageProviderID, @MJAIConfigurations_ParentID_DefaultStorageRootPath, @MJAIConfigurations_ParentID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_ParentIDID, @Name = @MJAIConfigurations_ParentID_Name, @Description = @MJAIConfigurations_ParentID_Description, @IsDefault = @MJAIConfigurations_ParentID_IsDefault, @Status = @MJAIConfigurations_ParentID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_ParentID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_ParentID_DefaultStorageRootPath, @ParentID_Clear = 1, @ParentID = @MJAIConfigurations_ParentID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_ParentID_cursor INTO @MJAIConfigurations_ParentIDID, @MJAIConfigurations_ParentID_Name, @MJAIConfigurations_ParentID_Description, @MJAIConfigurations_ParentID_IsDefault, @MJAIConfigurations_ParentID_Status, @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID, @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_ParentID_DefaultStorageProviderID, @MJAIConfigurations_ParentID_DefaultStorageRootPath, @MJAIConfigurations_ParentID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_ParentID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_ParentID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_ConfigurationIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_ConfigurationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [ConfigurationID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_ConfigurationID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_ConfigurationID_cursor INTO @MJAIPromptModels_ConfigurationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_ConfigurationIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_ConfigurationID_cursor INTO @MJAIPromptModels_ConfigurationIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_ConfigurationID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_ConfigurationID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ConfigurationIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ConfigurationID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensUsed int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ConfigurationID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ConfigurationID_Success bit
    DECLARE @MJAIPromptRuns_ConfigurationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ConfigurationID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ConfigurationID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ConfigurationID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_TopK int
    DECLARE @MJAIPromptRuns_ConfigurationID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_Seed int
    DECLARE @MJAIPromptRuns_ConfigurationID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_LogProbs bit
    DECLARE @MJAIPromptRuns_ConfigurationID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ConfigurationID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ConfigurationID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ConfigurationID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ConfigurationID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ConfigurationID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ConfigurationID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_Cancelled bit
    DECLARE @MJAIPromptRuns_ConfigurationID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ConfigurationID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_CacheHit bit
    DECLARE @MJAIPromptRuns_ConfigurationID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ConfigurationID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ConfigurationID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ConfigurationID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ConfigurationID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_QueueTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_PromptTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_CompletionTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_EffortLevel int
    DECLARE @MJAIPromptRuns_ConfigurationID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ConfigurationID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_ConfigurationID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ConfigurationID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ConfigurationID_cursor INTO @MJAIPromptRuns_ConfigurationIDID, @MJAIPromptRuns_ConfigurationID_PromptID, @MJAIPromptRuns_ConfigurationID_ModelID, @MJAIPromptRuns_ConfigurationID_VendorID, @MJAIPromptRuns_ConfigurationID_AgentID, @MJAIPromptRuns_ConfigurationID_ConfigurationID, @MJAIPromptRuns_ConfigurationID_RunAt, @MJAIPromptRuns_ConfigurationID_CompletedAt, @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, @MJAIPromptRuns_ConfigurationID_Messages, @MJAIPromptRuns_ConfigurationID_Result, @MJAIPromptRuns_ConfigurationID_TokensUsed, @MJAIPromptRuns_ConfigurationID_TokensPrompt, @MJAIPromptRuns_ConfigurationID_TokensCompletion, @MJAIPromptRuns_ConfigurationID_TotalCost, @MJAIPromptRuns_ConfigurationID_Success, @MJAIPromptRuns_ConfigurationID_ErrorMessage, @MJAIPromptRuns_ConfigurationID_ParentID, @MJAIPromptRuns_ConfigurationID_RunType, @MJAIPromptRuns_ConfigurationID_ExecutionOrder, @MJAIPromptRuns_ConfigurationID_AgentRunID, @MJAIPromptRuns_ConfigurationID_Cost, @MJAIPromptRuns_ConfigurationID_CostCurrency, @MJAIPromptRuns_ConfigurationID_TokensUsedRollup, @MJAIPromptRuns_ConfigurationID_TokensPromptRollup, @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, @MJAIPromptRuns_ConfigurationID_Temperature, @MJAIPromptRuns_ConfigurationID_TopP, @MJAIPromptRuns_ConfigurationID_TopK, @MJAIPromptRuns_ConfigurationID_MinP, @MJAIPromptRuns_ConfigurationID_FrequencyPenalty, @MJAIPromptRuns_ConfigurationID_PresencePenalty, @MJAIPromptRuns_ConfigurationID_Seed, @MJAIPromptRuns_ConfigurationID_StopSequences, @MJAIPromptRuns_ConfigurationID_ResponseFormat, @MJAIPromptRuns_ConfigurationID_LogProbs, @MJAIPromptRuns_ConfigurationID_TopLogProbs, @MJAIPromptRuns_ConfigurationID_DescendantCost, @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, @MJAIPromptRuns_ConfigurationID_FinalValidationPassed, @MJAIPromptRuns_ConfigurationID_ValidationBehavior, @MJAIPromptRuns_ConfigurationID_RetryStrategy, @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, @MJAIPromptRuns_ConfigurationID_FinalValidationError, @MJAIPromptRuns_ConfigurationID_ValidationErrorCount, @MJAIPromptRuns_ConfigurationID_CommonValidationError, @MJAIPromptRuns_ConfigurationID_FirstAttemptAt, @MJAIPromptRuns_ConfigurationID_LastAttemptAt, @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, @MJAIPromptRuns_ConfigurationID_ValidationAttempts, @MJAIPromptRuns_ConfigurationID_ValidationSummary, @MJAIPromptRuns_ConfigurationID_FailoverAttempts, @MJAIPromptRuns_ConfigurationID_FailoverErrors, @MJAIPromptRuns_ConfigurationID_FailoverDurations, @MJAIPromptRuns_ConfigurationID_OriginalModelID, @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, @MJAIPromptRuns_ConfigurationID_ModelSelection, @MJAIPromptRuns_ConfigurationID_Status, @MJAIPromptRuns_ConfigurationID_Cancelled, @MJAIPromptRuns_ConfigurationID_CancellationReason, @MJAIPromptRuns_ConfigurationID_ModelPowerRank, @MJAIPromptRuns_ConfigurationID_SelectionStrategy, @MJAIPromptRuns_ConfigurationID_CacheHit, @MJAIPromptRuns_ConfigurationID_CacheKey, @MJAIPromptRuns_ConfigurationID_JudgeID, @MJAIPromptRuns_ConfigurationID_JudgeScore, @MJAIPromptRuns_ConfigurationID_WasSelectedResult, @MJAIPromptRuns_ConfigurationID_StreamingEnabled, @MJAIPromptRuns_ConfigurationID_FirstTokenTime, @MJAIPromptRuns_ConfigurationID_ErrorDetails, @MJAIPromptRuns_ConfigurationID_ChildPromptID, @MJAIPromptRuns_ConfigurationID_QueueTime, @MJAIPromptRuns_ConfigurationID_PromptTime, @MJAIPromptRuns_ConfigurationID_CompletionTime, @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, @MJAIPromptRuns_ConfigurationID_EffortLevel, @MJAIPromptRuns_ConfigurationID_RunName, @MJAIPromptRuns_ConfigurationID_Comments, @MJAIPromptRuns_ConfigurationID_TestRunID, @MJAIPromptRuns_ConfigurationID_AssistantPrefill, @MJAIPromptRuns_ConfigurationID_TokensCacheRead, @MJAIPromptRuns_ConfigurationID_TokensCacheWrite, @MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup, @MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ConfigurationID_ConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ConfigurationIDID, @PromptID = @MJAIPromptRuns_ConfigurationID_PromptID, @ModelID = @MJAIPromptRuns_ConfigurationID_ModelID, @VendorID = @MJAIPromptRuns_ConfigurationID_VendorID, @AgentID = @MJAIPromptRuns_ConfigurationID_AgentID, @ConfigurationID_Clear = 1, @ConfigurationID = @MJAIPromptRuns_ConfigurationID_ConfigurationID, @RunAt = @MJAIPromptRuns_ConfigurationID_RunAt, @CompletedAt = @MJAIPromptRuns_ConfigurationID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ConfigurationID_Messages, @Result = @MJAIPromptRuns_ConfigurationID_Result, @TokensUsed = @MJAIPromptRuns_ConfigurationID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ConfigurationID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ConfigurationID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ConfigurationID_TotalCost, @Success = @MJAIPromptRuns_ConfigurationID_Success, @ErrorMessage = @MJAIPromptRuns_ConfigurationID_ErrorMessage, @ParentID = @MJAIPromptRuns_ConfigurationID_ParentID, @RunType = @MJAIPromptRuns_ConfigurationID_RunType, @ExecutionOrder = @MJAIPromptRuns_ConfigurationID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ConfigurationID_AgentRunID, @Cost = @MJAIPromptRuns_ConfigurationID_Cost, @CostCurrency = @MJAIPromptRuns_ConfigurationID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ConfigurationID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ConfigurationID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ConfigurationID_Temperature, @TopP = @MJAIPromptRuns_ConfigurationID_TopP, @TopK = @MJAIPromptRuns_ConfigurationID_TopK, @MinP = @MJAIPromptRuns_ConfigurationID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ConfigurationID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ConfigurationID_PresencePenalty, @Seed = @MJAIPromptRuns_ConfigurationID_Seed, @StopSequences = @MJAIPromptRuns_ConfigurationID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ConfigurationID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ConfigurationID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ConfigurationID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ConfigurationID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ConfigurationID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ConfigurationID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ConfigurationID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ConfigurationID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ConfigurationID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ConfigurationID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ConfigurationID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ConfigurationID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ConfigurationID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ConfigurationID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ConfigurationID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ConfigurationID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ConfigurationID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ConfigurationID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ConfigurationID_ModelSelection, @Status = @MJAIPromptRuns_ConfigurationID_Status, @Cancelled = @MJAIPromptRuns_ConfigurationID_Cancelled, @CancellationReason = @MJAIPromptRuns_ConfigurationID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ConfigurationID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ConfigurationID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ConfigurationID_CacheHit, @CacheKey = @MJAIPromptRuns_ConfigurationID_CacheKey, @JudgeID = @MJAIPromptRuns_ConfigurationID_JudgeID, @JudgeScore = @MJAIPromptRuns_ConfigurationID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ConfigurationID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ConfigurationID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ConfigurationID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ConfigurationID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ConfigurationID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ConfigurationID_QueueTime, @PromptTime = @MJAIPromptRuns_ConfigurationID_PromptTime, @CompletionTime = @MJAIPromptRuns_ConfigurationID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ConfigurationID_EffortLevel, @RunName = @MJAIPromptRuns_ConfigurationID_RunName, @Comments = @MJAIPromptRuns_ConfigurationID_Comments, @TestRunID = @MJAIPromptRuns_ConfigurationID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ConfigurationID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ConfigurationID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ConfigurationID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ConfigurationID_cursor INTO @MJAIPromptRuns_ConfigurationIDID, @MJAIPromptRuns_ConfigurationID_PromptID, @MJAIPromptRuns_ConfigurationID_ModelID, @MJAIPromptRuns_ConfigurationID_VendorID, @MJAIPromptRuns_ConfigurationID_AgentID, @MJAIPromptRuns_ConfigurationID_ConfigurationID, @MJAIPromptRuns_ConfigurationID_RunAt, @MJAIPromptRuns_ConfigurationID_CompletedAt, @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, @MJAIPromptRuns_ConfigurationID_Messages, @MJAIPromptRuns_ConfigurationID_Result, @MJAIPromptRuns_ConfigurationID_TokensUsed, @MJAIPromptRuns_ConfigurationID_TokensPrompt, @MJAIPromptRuns_ConfigurationID_TokensCompletion, @MJAIPromptRuns_ConfigurationID_TotalCost, @MJAIPromptRuns_ConfigurationID_Success, @MJAIPromptRuns_ConfigurationID_ErrorMessage, @MJAIPromptRuns_ConfigurationID_ParentID, @MJAIPromptRuns_ConfigurationID_RunType, @MJAIPromptRuns_ConfigurationID_ExecutionOrder, @MJAIPromptRuns_ConfigurationID_AgentRunID, @MJAIPromptRuns_ConfigurationID_Cost, @MJAIPromptRuns_ConfigurationID_CostCurrency, @MJAIPromptRuns_ConfigurationID_TokensUsedRollup, @MJAIPromptRuns_ConfigurationID_TokensPromptRollup, @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, @MJAIPromptRuns_ConfigurationID_Temperature, @MJAIPromptRuns_ConfigurationID_TopP, @MJAIPromptRuns_ConfigurationID_TopK, @MJAIPromptRuns_ConfigurationID_MinP, @MJAIPromptRuns_ConfigurationID_FrequencyPenalty, @MJAIPromptRuns_ConfigurationID_PresencePenalty, @MJAIPromptRuns_ConfigurationID_Seed, @MJAIPromptRuns_ConfigurationID_StopSequences, @MJAIPromptRuns_ConfigurationID_ResponseFormat, @MJAIPromptRuns_ConfigurationID_LogProbs, @MJAIPromptRuns_ConfigurationID_TopLogProbs, @MJAIPromptRuns_ConfigurationID_DescendantCost, @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, @MJAIPromptRuns_ConfigurationID_FinalValidationPassed, @MJAIPromptRuns_ConfigurationID_ValidationBehavior, @MJAIPromptRuns_ConfigurationID_RetryStrategy, @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, @MJAIPromptRuns_ConfigurationID_FinalValidationError, @MJAIPromptRuns_ConfigurationID_ValidationErrorCount, @MJAIPromptRuns_ConfigurationID_CommonValidationError, @MJAIPromptRuns_ConfigurationID_FirstAttemptAt, @MJAIPromptRuns_ConfigurationID_LastAttemptAt, @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, @MJAIPromptRuns_ConfigurationID_ValidationAttempts, @MJAIPromptRuns_ConfigurationID_ValidationSummary, @MJAIPromptRuns_ConfigurationID_FailoverAttempts, @MJAIPromptRuns_ConfigurationID_FailoverErrors, @MJAIPromptRuns_ConfigurationID_FailoverDurations, @MJAIPromptRuns_ConfigurationID_OriginalModelID, @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, @MJAIPromptRuns_ConfigurationID_ModelSelection, @MJAIPromptRuns_ConfigurationID_Status, @MJAIPromptRuns_ConfigurationID_Cancelled, @MJAIPromptRuns_ConfigurationID_CancellationReason, @MJAIPromptRuns_ConfigurationID_ModelPowerRank, @MJAIPromptRuns_ConfigurationID_SelectionStrategy, @MJAIPromptRuns_ConfigurationID_CacheHit, @MJAIPromptRuns_ConfigurationID_CacheKey, @MJAIPromptRuns_ConfigurationID_JudgeID, @MJAIPromptRuns_ConfigurationID_JudgeScore, @MJAIPromptRuns_ConfigurationID_WasSelectedResult, @MJAIPromptRuns_ConfigurationID_StreamingEnabled, @MJAIPromptRuns_ConfigurationID_FirstTokenTime, @MJAIPromptRuns_ConfigurationID_ErrorDetails, @MJAIPromptRuns_ConfigurationID_ChildPromptID, @MJAIPromptRuns_ConfigurationID_QueueTime, @MJAIPromptRuns_ConfigurationID_PromptTime, @MJAIPromptRuns_ConfigurationID_CompletionTime, @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, @MJAIPromptRuns_ConfigurationID_EffortLevel, @MJAIPromptRuns_ConfigurationID_RunName, @MJAIPromptRuns_ConfigurationID_Comments, @MJAIPromptRuns_ConfigurationID_TestRunID, @MJAIPromptRuns_ConfigurationID_AssistantPrefill, @MJAIPromptRuns_ConfigurationID_TokensCacheRead, @MJAIPromptRuns_ConfigurationID_TokensCacheWrite, @MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup, @MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_ConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ConfigurationID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_ConfigurationIDID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_ConfigurationID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_ConfigurationID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_ConfigurationID_Status nvarchar(50)
    DECLARE @MJAIResultCache_ConfigurationID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_ConfigurationID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_ConfigurationID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_ConfigurationID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [ConfigurationID] = @ID

    OPEN cascade_update_MJAIResultCache_ConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_ConfigurationID_cursor INTO @MJAIResultCache_ConfigurationIDID, @MJAIResultCache_ConfigurationID_AIPromptID, @MJAIResultCache_ConfigurationID_AIModelID, @MJAIResultCache_ConfigurationID_RunAt, @MJAIResultCache_ConfigurationID_PromptText, @MJAIResultCache_ConfigurationID_ResultText, @MJAIResultCache_ConfigurationID_Status, @MJAIResultCache_ConfigurationID_ExpiredOn, @MJAIResultCache_ConfigurationID_VendorID, @MJAIResultCache_ConfigurationID_AgentID, @MJAIResultCache_ConfigurationID_ConfigurationID, @MJAIResultCache_ConfigurationID_PromptEmbedding, @MJAIResultCache_ConfigurationID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_ConfigurationID_ConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_ConfigurationIDID, @AIPromptID = @MJAIResultCache_ConfigurationID_AIPromptID, @AIModelID = @MJAIResultCache_ConfigurationID_AIModelID, @RunAt = @MJAIResultCache_ConfigurationID_RunAt, @PromptText = @MJAIResultCache_ConfigurationID_PromptText, @ResultText = @MJAIResultCache_ConfigurationID_ResultText, @Status = @MJAIResultCache_ConfigurationID_Status, @ExpiredOn = @MJAIResultCache_ConfigurationID_ExpiredOn, @VendorID = @MJAIResultCache_ConfigurationID_VendorID, @AgentID = @MJAIResultCache_ConfigurationID_AgentID, @ConfigurationID_Clear = 1, @ConfigurationID = @MJAIResultCache_ConfigurationID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_ConfigurationID_PromptEmbedding, @PromptRunID = @MJAIResultCache_ConfigurationID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_ConfigurationID_cursor INTO @MJAIResultCache_ConfigurationIDID, @MJAIResultCache_ConfigurationID_AIPromptID, @MJAIResultCache_ConfigurationID_AIModelID, @MJAIResultCache_ConfigurationID_RunAt, @MJAIResultCache_ConfigurationID_PromptText, @MJAIResultCache_ConfigurationID_ResultText, @MJAIResultCache_ConfigurationID_Status, @MJAIResultCache_ConfigurationID_ExpiredOn, @MJAIResultCache_ConfigurationID_VendorID, @MJAIResultCache_ConfigurationID_AgentID, @MJAIResultCache_ConfigurationID_ConfigurationID, @MJAIResultCache_ConfigurationID_PromptEmbedding, @MJAIResultCache_ConfigurationID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_ConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_ConfigurationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIConfiguration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_DefaultCompactPromptIDID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CategoryID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Name nvarchar(425)
    DECLARE @MJActions_DefaultCompactPromptID_Description nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Type nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_UserComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Code nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_DefaultCompactPromptID_CodeLocked bit
    DECLARE @MJActions_DefaultCompactPromptID_ForceCodeGeneration bit
    DECLARE @MJActions_DefaultCompactPromptID_RetentionPeriod int
    DECLARE @MJActions_DefaultCompactPromptID_Status nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_DriverClass nvarchar(255)
    DECLARE @MJActions_DefaultCompactPromptID_ParentID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_IconClass nvarchar(100)
    DECLARE @MJActions_DefaultCompactPromptID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Config nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS int
    DECLARE @MJActions_DefaultCompactPromptID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_DefaultCompactPromptID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [DefaultCompactPromptID] = @ID

    OPEN cascade_update_MJActions_DefaultCompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_DefaultCompactPromptID_DefaultCompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_DefaultCompactPromptIDID, @CategoryID = @MJActions_DefaultCompactPromptID_CategoryID, @Name = @MJActions_DefaultCompactPromptID_Name, @Description = @MJActions_DefaultCompactPromptID_Description, @Type = @MJActions_DefaultCompactPromptID_Type, @UserPrompt = @MJActions_DefaultCompactPromptID_UserPrompt, @UserComments = @MJActions_DefaultCompactPromptID_UserComments, @Code = @MJActions_DefaultCompactPromptID_Code, @CodeComments = @MJActions_DefaultCompactPromptID_CodeComments, @CodeApprovalStatus = @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_DefaultCompactPromptID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_DefaultCompactPromptID_CodeApprovedAt, @CodeLocked = @MJActions_DefaultCompactPromptID_CodeLocked, @ForceCodeGeneration = @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @RetentionPeriod = @MJActions_DefaultCompactPromptID_RetentionPeriod, @Status = @MJActions_DefaultCompactPromptID_Status, @DriverClass = @MJActions_DefaultCompactPromptID_DriverClass, @ParentID = @MJActions_DefaultCompactPromptID_ParentID, @IconClass = @MJActions_DefaultCompactPromptID_IconClass, @DefaultCompactPromptID_Clear = 1, @DefaultCompactPromptID = @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @Config = @MJActions_DefaultCompactPromptID_Config, @RuntimeActionConfiguration = @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @CreatedByAgentID = @MJActions_DefaultCompactPromptID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_DefaultCompactPromptID_cursor
    DEALLOCATE cascade_update_MJActions_DefaultCompactPromptID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_CompactPromptIDID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactLength int
    DECLARE @MJAIAgentActions_CompactPromptID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_CompactPromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [CompactPromptID] = @ID

    OPEN cascade_update_MJAIAgentActions_CompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_CompactPromptID_CompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_CompactPromptIDID, @AgentID = @MJAIAgentActions_CompactPromptID_AgentID, @ActionID = @MJAIAgentActions_CompactPromptID_ActionID, @Status = @MJAIAgentActions_CompactPromptID_Status, @MinExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_CompactPromptID_CompactMode, @CompactLength = @MJAIAgentActions_CompactPromptID_CompactLength, @CompactPromptID_Clear = 1, @CompactPromptID = @MJAIAgentActions_CompactPromptID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_PromptIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_PromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_StartingStep bit
    DECLARE @MJAIAgentSteps_PromptID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_PromptID_RetryCount int
    DECLARE @MJAIAgentSteps_PromptID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_PositionX int
    DECLARE @MJAIAgentSteps_PromptID_PositionY int
    DECLARE @MJAIAgentSteps_PromptID_Width int
    DECLARE @MJAIAgentSteps_PromptID_Height int
    DECLARE @MJAIAgentSteps_PromptID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_PromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJAIAgentSteps_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_PromptIDID, @AgentID = @MJAIAgentSteps_PromptID_AgentID, @Name = @MJAIAgentSteps_PromptID_Name, @Description = @MJAIAgentSteps_PromptID_Description, @StepType = @MJAIAgentSteps_PromptID_StepType, @StartingStep = @MJAIAgentSteps_PromptID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_PromptID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_PromptID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_PromptID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_PromptID_ActionID, @SubAgentID = @MJAIAgentSteps_PromptID_SubAgentID, @PromptID_Clear = 1, @PromptID = @MJAIAgentSteps_PromptID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_PromptID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_PromptID_PositionX, @PositionY = @MJAIAgentSteps_PromptID_PositionY, @Width = @MJAIAgentSteps_PromptID_Width, @Height = @MJAIAgentSteps_PromptID_Height, @Status = @MJAIAgentSteps_PromptID_Status, @ActionInputMapping = @MJAIAgentSteps_PromptID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_PromptID_LoopBodyType, @Configuration = @MJAIAgentSteps_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_PromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_PromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_SystemPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_SystemPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_SystemPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_SystemPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [SystemPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_SystemPromptID_SystemPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_SystemPromptIDID, @Name = @MJAIAgentTypes_SystemPromptID_Name, @Description = @MJAIAgentTypes_SystemPromptID_Description, @SystemPromptID_Clear = 1, @SystemPromptID = @MJAIAgentTypes_SystemPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_SystemPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_SystemPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_SystemPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID
    END

    CLOSE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxMessages int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles bit
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles
    END

    CLOSE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextCompressionID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @Name = @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @DefaultPromptForContextCompressionID_Clear = 1, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextSummarizationID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @Name = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID_Clear = 1, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_PromptID_cursor
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun
    DECLARE @MJAIPromptRuns_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRuns_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptRuns_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRun] @ID = @MJAIPromptRuns_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRuns_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRuns_PromptID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_JudgeIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_JudgeID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsed int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPrompt int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletion int
    DECLARE @MJAIPromptRuns_JudgeID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_Success bit
    DECLARE @MJAIPromptRuns_JudgeID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_JudgeID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_JudgeID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopK int
    DECLARE @MJAIPromptRuns_JudgeID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_Seed int
    DECLARE @MJAIPromptRuns_JudgeID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_LogProbs bit
    DECLARE @MJAIPromptRuns_JudgeID_TopLogProbs int
    DECLARE @MJAIPromptRuns_JudgeID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_JudgeID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_JudgeID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_JudgeID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_JudgeID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_JudgeID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_Cancelled bit
    DECLARE @MJAIPromptRuns_JudgeID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_JudgeID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_CacheHit bit
    DECLARE @MJAIPromptRuns_JudgeID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_JudgeID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_JudgeID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_JudgeID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_JudgeID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_QueueTime int
    DECLARE @MJAIPromptRuns_JudgeID_PromptTime int
    DECLARE @MJAIPromptRuns_JudgeID_CompletionTime int
    DECLARE @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_EffortLevel int
    DECLARE @MJAIPromptRuns_JudgeID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_JudgeID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [JudgeID] = @ID

    OPEN cascade_update_MJAIPromptRuns_JudgeID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_AgentRunID, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_JudgeID_JudgeID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_JudgeIDID, @PromptID = @MJAIPromptRuns_JudgeID_PromptID, @ModelID = @MJAIPromptRuns_JudgeID_ModelID, @VendorID = @MJAIPromptRuns_JudgeID_VendorID, @AgentID = @MJAIPromptRuns_JudgeID_AgentID, @ConfigurationID = @MJAIPromptRuns_JudgeID_ConfigurationID, @RunAt = @MJAIPromptRuns_JudgeID_RunAt, @CompletedAt = @MJAIPromptRuns_JudgeID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_JudgeID_Messages, @Result = @MJAIPromptRuns_JudgeID_Result, @TokensUsed = @MJAIPromptRuns_JudgeID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_JudgeID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_JudgeID_TokensCompletion, @TotalCost = @MJAIPromptRuns_JudgeID_TotalCost, @Success = @MJAIPromptRuns_JudgeID_Success, @ErrorMessage = @MJAIPromptRuns_JudgeID_ErrorMessage, @ParentID = @MJAIPromptRuns_JudgeID_ParentID, @RunType = @MJAIPromptRuns_JudgeID_RunType, @ExecutionOrder = @MJAIPromptRuns_JudgeID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_JudgeID_AgentRunID, @Cost = @MJAIPromptRuns_JudgeID_Cost, @CostCurrency = @MJAIPromptRuns_JudgeID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_JudgeID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_JudgeID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_JudgeID_Temperature, @TopP = @MJAIPromptRuns_JudgeID_TopP, @TopK = @MJAIPromptRuns_JudgeID_TopK, @MinP = @MJAIPromptRuns_JudgeID_MinP, @FrequencyPenalty = @MJAIPromptRuns_JudgeID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_JudgeID_PresencePenalty, @Seed = @MJAIPromptRuns_JudgeID_Seed, @StopSequences = @MJAIPromptRuns_JudgeID_StopSequences, @ResponseFormat = @MJAIPromptRuns_JudgeID_ResponseFormat, @LogProbs = @MJAIPromptRuns_JudgeID_LogProbs, @TopLogProbs = @MJAIPromptRuns_JudgeID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_JudgeID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_JudgeID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_JudgeID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_JudgeID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_JudgeID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_JudgeID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_JudgeID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_JudgeID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_JudgeID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_JudgeID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_JudgeID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_JudgeID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_JudgeID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_JudgeID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_JudgeID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_JudgeID_ModelSelection, @Status = @MJAIPromptRuns_JudgeID_Status, @Cancelled = @MJAIPromptRuns_JudgeID_Cancelled, @CancellationReason = @MJAIPromptRuns_JudgeID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_JudgeID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_JudgeID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_JudgeID_CacheHit, @CacheKey = @MJAIPromptRuns_JudgeID_CacheKey, @JudgeID_Clear = 1, @JudgeID = @MJAIPromptRuns_JudgeID_JudgeID, @JudgeScore = @MJAIPromptRuns_JudgeID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_JudgeID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_JudgeID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_JudgeID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_JudgeID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_JudgeID_ChildPromptID, @QueueTime = @MJAIPromptRuns_JudgeID_QueueTime, @PromptTime = @MJAIPromptRuns_JudgeID_PromptTime, @CompletionTime = @MJAIPromptRuns_JudgeID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_JudgeID_EffortLevel, @RunName = @MJAIPromptRuns_JudgeID_RunName, @Comments = @MJAIPromptRuns_JudgeID_Comments, @TestRunID = @MJAIPromptRuns_JudgeID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_JudgeID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_JudgeID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_JudgeID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_AgentRunID, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_JudgeID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_JudgeID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ChildPromptIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsed int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_Success bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopK int
    DECLARE @MJAIPromptRuns_ChildPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_Seed int
    DECLARE @MJAIPromptRuns_ChildPromptID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_LogProbs bit
    DECLARE @MJAIPromptRuns_ChildPromptID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ChildPromptID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_Cancelled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ChildPromptID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheHit bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ChildPromptID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ChildPromptID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_QueueTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletionTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_EffortLevel int
    DECLARE @MJAIPromptRuns_ChildPromptID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_ChildPromptID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ChildPromptID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_AgentRunID, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ChildPromptID_ChildPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ChildPromptIDID, @PromptID = @MJAIPromptRuns_ChildPromptID_PromptID, @ModelID = @MJAIPromptRuns_ChildPromptID_ModelID, @VendorID = @MJAIPromptRuns_ChildPromptID_VendorID, @AgentID = @MJAIPromptRuns_ChildPromptID_AgentID, @ConfigurationID = @MJAIPromptRuns_ChildPromptID_ConfigurationID, @RunAt = @MJAIPromptRuns_ChildPromptID_RunAt, @CompletedAt = @MJAIPromptRuns_ChildPromptID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ChildPromptID_Messages, @Result = @MJAIPromptRuns_ChildPromptID_Result, @TokensUsed = @MJAIPromptRuns_ChildPromptID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ChildPromptID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ChildPromptID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ChildPromptID_TotalCost, @Success = @MJAIPromptRuns_ChildPromptID_Success, @ErrorMessage = @MJAIPromptRuns_ChildPromptID_ErrorMessage, @ParentID = @MJAIPromptRuns_ChildPromptID_ParentID, @RunType = @MJAIPromptRuns_ChildPromptID_RunType, @ExecutionOrder = @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ChildPromptID_AgentRunID, @Cost = @MJAIPromptRuns_ChildPromptID_Cost, @CostCurrency = @MJAIPromptRuns_ChildPromptID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ChildPromptID_Temperature, @TopP = @MJAIPromptRuns_ChildPromptID_TopP, @TopK = @MJAIPromptRuns_ChildPromptID_TopK, @MinP = @MJAIPromptRuns_ChildPromptID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ChildPromptID_PresencePenalty, @Seed = @MJAIPromptRuns_ChildPromptID_Seed, @StopSequences = @MJAIPromptRuns_ChildPromptID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ChildPromptID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ChildPromptID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ChildPromptID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ChildPromptID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ChildPromptID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ChildPromptID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ChildPromptID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ChildPromptID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ChildPromptID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ChildPromptID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ChildPromptID_ModelSelection, @Status = @MJAIPromptRuns_ChildPromptID_Status, @Cancelled = @MJAIPromptRuns_ChildPromptID_Cancelled, @CancellationReason = @MJAIPromptRuns_ChildPromptID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ChildPromptID_CacheHit, @CacheKey = @MJAIPromptRuns_ChildPromptID_CacheKey, @JudgeID = @MJAIPromptRuns_ChildPromptID_JudgeID, @JudgeScore = @MJAIPromptRuns_ChildPromptID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ChildPromptID_ErrorDetails, @ChildPromptID_Clear = 1, @ChildPromptID = @MJAIPromptRuns_ChildPromptID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ChildPromptID_QueueTime, @PromptTime = @MJAIPromptRuns_ChildPromptID_PromptTime, @CompletionTime = @MJAIPromptRuns_ChildPromptID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ChildPromptID_EffortLevel, @RunName = @MJAIPromptRuns_ChildPromptID_RunName, @Comments = @MJAIPromptRuns_ChildPromptID_Comments, @TestRunID = @MJAIPromptRuns_ChildPromptID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_AgentRunID, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt
    DECLARE @MJAIPrompts_ResultSelectorPromptIDID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Name nvarchar(255)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Description nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Status nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResponseFormat nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinPowerRank int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PowerPreference nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelCount int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam nvarchar(100)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputType nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputExample nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MaxRetries int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EnableCaching bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMatchType nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold float(53)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptRole nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptPosition nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopK int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Seed int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_StopSequences nvarchar(1000)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopLogProbs int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EffortLevel int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels bit
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel], [AssistantPrefill], [PrefillFallbackMode], [RequireSpecificModels]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID_Clear = 1, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @AssistantPrefill = @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @PrefillFallbackMode = @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @RequireSpecificModels = @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels
    END

    CLOSE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    DEALLOCATE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache
    DECLARE @MJAIResultCache_AIPromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIResultCache_AIPromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AIPromptID] = @ID
    
    OPEN cascade_delete_MJAIResultCache_AIPromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIResultCache] @ID = @MJAIResultCache_AIPromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    END
    
    CLOSE cascade_delete_MJAIResultCache_AIPromptID_cursor
    DEALLOCATE cascade_delete_MJAIResultCache_AIPromptID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* spDelete Permissions for MJ: AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'EFAFC399-58A9-42E6-AFF4-A31CBE7CAC16'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A6584C65-63F7-46CA-8A58-25BC5B6BFD54'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4333EAE9-2185-403F-B742-B8FF9631C860'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BB204D9E-2D75-4DB7-8022-55E73A56CBCA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EFAFC399-58A9-42E6-AFF4-A31CBE7CAC16'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'EFAFC399-58A9-42E6-AFF4-A31CBE7CAC16'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '4333EAE9-2185-403F-B742-B8FF9631C860'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'A6584C65-63F7-46CA-8A58-25BC5B6BFD54'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '5A5CF9A9-EAE7-4ECB-B1B7-277BAAC73127'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A60033A0-D13C-4954-8EF3-6BB8A5618126'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8EB9EB12-02C0-4D19-BC14-0DC706C9EE58'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2DE35331-2554-4E99-8C8E-2FB392B3B658'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '206BDDB4-41C4-4CC4-8057-43BE145DFE13'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '5603B884-25A8-4D10-94A3-636E59F3E91C'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'F1D62EEE-FEEF-4D0C-8955-7AB4442A9150'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 21 fields */

-- UPDATE Entity Field Category Info MJ: AI Model Costs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D17303CA-6FF4-4AE7-967D-280A513D86B1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9FABB12A-530B-4BA6-B010-45764AC367D2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BD7F876-9955-4709-BE02-E7B08DEF0183' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F4CE42AF-8176-4AE7-ABBC-920E05246BDC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.VendorID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Vendor',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0FBBF368-839D-4AF7-8511-367E1C2192B5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.Model 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB204D9E-2D75-4DB7-8022-55E73A56CBCA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.Vendor 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Vendor Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFAFC399-58A9-42E6-AFF4-A31CBE7CAC16' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BC22B43-6899-4C85-A5CB-9BCBA5921ADB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E492CEA6-2FC8-406D-AFD4-CADA71500C5F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6584C65-63F7-46CA-8A58-25BC5B6BFD54' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.ProcessingType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4333EAE9-2185-403F-B742-B8FF9631C860' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '28EA9FCF-10DA-4B66-B861-A19025ACEE01' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.Currency 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C3423FB-4C5A-47D8-8028-86C118673AE9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.PriceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Price Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E15E12CB-7D14-477D-ADBA-29486BD55EC7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.InputPricePerUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B3BFA27-ED58-4919-9C16-CD1B367D7662' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.OutputPricePerUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B308AD69-D31B-4B46-802C-09698DBBAF18' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.CacheReadPricePerUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pricing Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Cache Read Price',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B7B51AA7-F0AF-4E84-A360-6A63A4B98074' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.CacheWritePricePerUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Pricing Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Cache Write Price',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77EA784F-5522-497A-971B-B1277681D5C3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.UnitTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Unit Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '298CFC42-48AE-4409-9D39-20014FFF1234' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.PriceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Price Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '29D4E0F8-B86C-4EB4-BF82-B44778494A53' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Model Costs.UnitType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Unit Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E3600DEA-E0E2-46A3-9FB3-2B0FD203E01F' AND AutoUpdateCategory = 1;

/* Set categories for 62 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Run ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CDCEFDE-FBFE-44CD-ACAF-A1543F309EC4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B5B91C2-2D8D-441D-9281-19089EF7B21E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ParentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8BE780BC-757D-4AC0-9ECC-5C9FFBAA38FD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1F5A7A4-9248-4C45-9D74-04E7B44A1DD5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '025D0895-4A17-4168-8B38-9B9C6D68CFD8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80FAFCF2-539E-4A38-86CD-9E9395C8664F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Success 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3C8FBEA-CA05-462D-94E5-7B4875446A79' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '057C84E7-BAD3-405A-B2B9-5D13551EFCD4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FF245A3-C823-49F8-B20A-31A64D0E6E77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '625FE9E6-9058-4FDD-8970-4595336C60D3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Result 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '974746E9-53D2-484B-AFF3-9B7D9292D6B7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentState 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6FF56877-27AE-47D9-A6CD-641088C2458E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Tokens',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7C0AFAA-E27C-41DA-8FAA-0B48E276089D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34F910FE-C31E-42FE-9A9E-08407AF79BDB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '13198D22-60EB-4694-B420-7BDB4E3E9BB8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B025CDE5-5300-46DA-BC49-7130D0689E81' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Tokens',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '69B7EB99-3409-4B84-B979-877E992964DC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCompletionTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Completion Tokens',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BE28D8A-2E06-460D-BDD7-34E5BEB5DBB0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalTokensUsedRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Tokens (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A60033A0-D13C-4954-8EF3-6BB8A5618126' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptTokensUsedRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Tokens (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FCD5864B-65BB-4E9F-A3FE-2C09D3461364' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCompletionTokensUsedRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Completion Tokens (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B1401167-0C3B-4D14-9633-6A3A1DC429A9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCostRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F9928463-5F2B-46C0-8DA3-6EEF2FA816EF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetailID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8505597E-558F-4222-ABF7-5BA4E163A97D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetailSequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Sequence',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D4896B2F-D530-4844-8C96-A0016F0A81D4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.CancellationReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '14A76D05-D24C-4EE0-B24E-B840DD330F60' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.FinalStep 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.FinalPayload 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6FFF2754-A03E-4DFD-AC17-FB16CDAD5346' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Message 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B55CD7D-06C3-485C-9FC0-CF4C33D66DF5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.LastRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44D62D04-D013-4C3B-A535-555E3AA388BB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.StartingPayload 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B106357D-347F-45BE-89AA-B96298ED1DDA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptIterations 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Iterations',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7411D673-9C57-4419-96BA-1C607B77DA43' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConfigurationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '038B0DB2-EB71-4E8D-945E-EBA1AA570391' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E95FDE6B-12E3-4A41-AA15-9EAD7695B266' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideVendorID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F8747D24-8E7D-4D12-BCF8-8CD9F7749566' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Data 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08037344-3952-4EBE-BA34-F87BD670C61A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Verbose 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Verbose',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07CD2EF5-1737-4662-BE76-301A3E88BD9D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.EffortLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B16B5B36-7238-4A90-ABAD-DA64ED8FADCA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.RunName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51A944B0-A282-4ED0-9D4E-1EE41498065A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6962DE96-798F-4E1C-AE87-489429927C4C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ScheduledJobRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77918E52-6BA1-4FA6-9AE1-F5987906D0C8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TestRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7685B81B-FD95-40F8-A3D6-4EB710DB054D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0F924E4-A919-4AE5-A0E6-F5D4847926D6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C6602391-0B0C-4ECB-8A16-3A8B019B5C3D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.SecondaryScopes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21FC62F2-F9CC-40C4-A1BA-462699CCD289' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ExternalReferenceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'External Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '40EA5AB0-58A3-4CCE-B7E1-C9BB56E7D5A4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope & Multi-Tenant',
   GeneratedFormSection = 'Category',
   DisplayName = 'Company',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '766B0728-BB2E-4827-B23A-7A4CA04FB7F6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCacheReadTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resource Usage & Cost',
   GeneratedFormSection = 'Category',
   DisplayName = 'Cache Read Tokens',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E031CC66-CB76-4515-ADBD-AAC808653144' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCacheWriteTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resource Usage & Cost',
   GeneratedFormSection = 'Category',
   DisplayName = 'Cache Write Tokens',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F3016DD5-C3B9-49D3-B0AC-7AA77CA7A64A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38A3F73F-9364-428E-A195-5DF74B9F9ACB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ParentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D94F2321-5DCA-4B11-8E17-57DC851BFDC5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Conversation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8FAF86E8-F74E-4D76-972A-197FBB245478' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9FEAEC67-96DB-4551-9954-AC631C8ADF0A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '66AAF27B-995D-4F5F-8149-BE6E35C7694C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.LastRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2996B20E-9DFD-41C8-A810-B0EC3038622B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F32D57F-954A-4DDD-BE50-A52E7E9FA1FF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F27EECF4-14ED-4338-9ABE-3E472415CE2B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideVendor 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Vendor Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E8614CB-65CB-4C28-9D0B-198CBA49CBBF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ScheduledJobRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C30AB32-15A4-460D-9955-DD89EDEF5F62' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TestRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34DF8E45-2C56-4E9D-AC4C-2FD4C4EEE196' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ECFA16C9-1005-4B07-90CB-690623428037' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.RootParentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A860DAE5-5AA8-4EBE-9C5F-914AFDD0E3C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.RootLastRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D3B3BBE7-627B-4A67-BFC3-81C2F248B9ED' AND AutoUpdateCategory = 1;

/* Set categories for 103 fields */

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB1A9EFA-52A5-4D39-A67B-0C623C037EA8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.PromptID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9407CD9F-EB55-4BB5-8CDD-5D2E70D9D739' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '71548843-FAAA-493F-A7D3-FDCB4A3A80DF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.VendorID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F4E86C22-D315-4DB1-9DA1-A5779B78EAAC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1D2EC52-E3DE-46E1-A7B7-C353C811E74C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ConfigurationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE9C78CB-14F9-4F2D-85A1-51860E35C95B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.RunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '403EBB3C-A506-4A45-807C-28B5BE669837' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C292566B-AEB6-495C-B228-97F4509E159F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ExecutionTimeMS 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C2E9D77-1A55-40B2-A6B5-B385BB95C14F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Success 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '621DBFAD-A8A3-4B94-9247-418F4B310FD2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F9A3491B-AC3C-4CD2-BBC6-6CC0BCD674DA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '559A6C83-012D-436E-BCD0-BF5BC195D1DD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.RunType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0524D957-C4AA-4CB6-AFEB-EAA4A0B831A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ExecutionOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54DFB777-475B-4C79-A736-10556471D86E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.AgentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3527B188-23DD-4C21-8716-BD17A5E05BB5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.RerunFromPromptRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Rerun From',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF55FAF1-BC63-432B-9137-5D0678DC08AA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '206BDDB4-41C4-4CC4-8057-43BE145DFE13' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Cancelled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '70260832-4420-451A-9A22-359FD83885FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.CancellationReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '085BE7AF-5389-43C0-BEE4-3748840E61F6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.CacheHit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E91D9BA-2775-488F-B647-EB44EF9E6112' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.CacheKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6D6AC347-E634-4846-B9F3-B9F46FBE16CC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.WasSelectedResult 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A3908B7-C914-48AD-9C91-3095CB4B6475' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.StreamingEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '69C2BA6E-FB8B-4F52-90CF-6D4D3FEAB81B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.FirstTokenTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F2B24363-336F-48D2-9B68-D9A81B27A224' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ErrorDetails 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '4B843B2C-8CC0-4B48-814C-1BF3B88D69BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ChildPromptID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2CD14363-BDDB-45BA-AEDE-731EE053CAB1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.RunName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F3050F3E-E62C-47B3-8F6F-F12DC42C86E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '037160AF-8D33-43F7-9C60-F200306B6DBC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TestRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CECDF34F-B76C-421E-9746-416F3C1CAB0B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B04C39C-CB71-464E-95BD-FFE0473C3799' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.AgentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9212269-5523-48F4-8C80-71FEDBDA14AD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.RerunFromPromptRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Rerun From Prompt Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E433AB22-95B8-42C7-921E-37B9BB04E6E2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TestRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F5B9551-EB7D-4CA9-B177-9D0473598E32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.RootParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F9F9EC70-B3C6-4619-9A43-0D8986A28A85' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.RootRerunFromPromptRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Rerun From',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55613DC7-0DDA-43AF-AE04-0F3D2BC709D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Messages 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A863F3D6-18E5-4FBD-B498-BC74BB6C7592' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Result 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D3C9BC7E-8FDA-4CC9-A6AF-F928183ED4EC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.StopSequences 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '81BC5339-5D6D-41F7-8D40-B619AC308284' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ResponseFormat 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '500B3FE9-F420-4036-AD0A-0CC999E6478A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.JudgeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Judge Prompt',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC0E9225-A041-4DA5-8C1C-AB26091D9A37' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.JudgeScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FCF30C26-0363-49F8-AF94-D8403348A6F1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ModelSpecificResponseDetails 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Model Response Details',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '645594E9-9A4D-4302-9268-C5D0656D4189' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.AssistantPrefill 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD1CA15C-264A-4D3A-A85A-9F6EE270C338' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Prompt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E114B8EB-89A2-4EF2-A45E-0D52E011FCCE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Model 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5603B884-25A8-4D10-94A3-636E59F3E91C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Vendor 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Vendor Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1D62EEE-FEEF-4D0C-8955-7AB4442A9150' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2DE35331-2554-4E99-8C8E-2FB392B3B658' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7A51776-F0C9-4411-9481-E46DC3EE9D4F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.OriginalModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Original Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E939815B-9896-49C5-BA22-6E25BEFE2F34' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Judge 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Judge Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20386410-106D-4540-A077-111FF35B281C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ChildPrompt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Child Prompt Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6EE88511-CE87-4BA6-AA0F-DA675C5C757B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Tokens Used',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8EB9EB12-02C0-4D19-BC14-0DC706C9EE58' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensPrompt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82D0E001-0826-44BC-B394-0299DAFBBB62' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensCompletion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F3C2E1E-2F65-4B98-82BB-CB48B6285546' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TotalCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '74BCF682-06A6-4DDC-BF1E-C7B5601D715E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Cost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADCD9C84-0FB1-45F4-9A9F-B42BD51A2503' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.CostCurrency 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Currency',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2A925F19-E0EA-41AF-8323-4542F310A09E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensUsedRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Tokens Used (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '16B3DCD4-E1A3-456B-AC93-FF72B2507B19' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensPromptRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Tokens Prompt (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '05F66D0A-9E5B-4A31-9B03-F26DF3FA70B1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensCompletionRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Tokens Completion (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF642024-62C7-41E2-86AA-FCE253463DE1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.DescendantCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1E51DB3-0F7A-4A20-8E82-0CE8E9257F47' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.FailoverAttempts 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C84B4CE2-5FE8-4BE0-9A3A-D0C5440E58B8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.FailoverErrors 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '67CB5D9F-21C7-472F-968B-1A546D4DF8B1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.FailoverDurations 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'E592040A-9AB1-4181-974D-D40598259CF2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.OriginalModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12569670-4ECE-445A-ADCF-E3018DC1B723' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.OriginalRequestStartTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Original Start Time',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '24CB1A5A-CC8F-4FAB-BCF8-3324534165BF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TotalFailoverDuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Failover Duration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C1D702A-F8B3-4B2B-8B88-E64621FDAA08' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.QueueTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9DF1B01F-510B-481F-A669-F0C128437817' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.PromptTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01E72544-1D2A-4FF2-9BC0-497E41F65473' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.CompletionTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '248F35BE-627E-4A29-8A08-CAB9DF3BA396' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensCacheRead 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE759024-EDCE-42BE-85E1-15069D68626C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensCacheWrite 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F81872DE-BE88-47EE-A581-8E5808E48013' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensCacheReadRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance & Cost Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tokens Cache Read (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '89DACEE1-6160-4ED9-9623-B458571EE42F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TokensCacheWriteRollup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance & Cost Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tokens Cache Write (Rollup)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1879842-1930-4AC7-9002-53B2400B0D2E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BAFFFCD7-77C9-4716-A0E2-60C41814CCC8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C32DE832-7849-457C-9A45-5F9BE3AF68CE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Temperature 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '95C3A075-173A-4858-9EC2-49EF6B976669' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TopP 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B7B30E68-EE85-4883-96D9-A1E3053396DF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TopK 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C39350C9-4593-4129-A130-73C730EE8559' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.MinP 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EBC17D08-2D86-4B7C-9B37-3A9D19E1E98F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.FrequencyPenalty 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F4723C61-222A-40F3-9C97-941715514B96' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.PresencePenalty 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF8F23C2-DEFE-442D-BD79-2178777C48EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.Seed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DED8E59B-666C-4D6E-9CEA-EB762B444F42' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.LogProbs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Log Probs',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '180A9E6F-8C78-42F1-9187-D969F3A0DFF2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TopLogProbs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Top Log Probs',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5601E9C4-A756-4453-8117-E8E5460CAEFC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ModelSelection 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Model Selection',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'F7B5B241-3D39-4715-80CA-77AB79AF8374' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ModelPowerRank 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF696B62-DD4F-4D12-A120-27464D4F3BEE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.SelectionStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F79694C-7A55-4E18-BBF6-C0A3B8D9BAF0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.EffortLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7B1032DB-F8AF-4EAF-9F03-7B9049FBA39D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ValidationAttemptCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5C8EB19-4E38-4962-A9C3-01B99B2CAF71' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.SuccessfulValidationCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB43B8DA-7A21-4734-9EE0-49BBAB0A2EBC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.FinalValidationPassed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B818BC71-69CA-48AB-8E82-FDBA4ACE9B9E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ValidationBehavior 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '19C655EA-36B6-4D1E-AD16-07E68D848C07' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.RetryStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8524915-5BE7-4BF6-8751-847427DCDFF5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.MaxRetriesConfigured 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '90035368-1453-43A8-B3D0-F822A75E63C3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.FinalValidationError 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A56CAAE4-C17C-4217-BF68-D4D1CE427ADF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ValidationErrorCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA772A8F-17FC-453A-AB19-69766C073663' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.CommonValidationError 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F7169BB-CDD8-43BE-B74D-C2D2D5AA2734' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.FirstAttemptAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FB83B39-DC79-4824-91B1-F4C7AC91FD50' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.LastAttemptAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '70717F1D-4FF4-488A-8BE4-0A2D47A0C702' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.TotalRetryDurationMS 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '10064F90-AA41-4DC5-981B-D308C767FD63' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ValidationAttempts 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '33BF165E-77A3-447D-94F3-DCB61EF83698' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.ValidationSummary 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '730E6B0B-B28C-4E90-A879-003181340C68' AND AutoUpdateCategory = 1;

