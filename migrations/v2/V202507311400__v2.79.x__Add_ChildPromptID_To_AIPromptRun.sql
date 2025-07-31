-- Add ChildPromptID to AIPromptRun to track the specific child prompt executed
-- when using hierarchical prompt composition
ALTER TABLE ${flyway:defaultSchema}.AIPromptRun
ADD ChildPromptID UNIQUEIDENTIFIER NULL;

-- Add foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.AIPromptRun
ADD CONSTRAINT FK_AIPromptRun_ChildPromptID 
    FOREIGN KEY (ChildPromptID) 
    REFERENCES ${flyway:defaultSchema}.AIPrompt(ID);

-- Add extended property description
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'References the specific child prompt that was executed as part of hierarchical prompt composition. NULL for regular prompts or parent prompts that don''t directly execute a child.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'ChildPromptID';


/***** CODE GEN RUN ******/
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2cd14363-bddb-45ba-aede-731ee053cab1'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'ChildPromptID')
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
            '2cd14363-bddb-45ba-aede-731ee053cab1',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100076,
            'ChildPromptID',
            'Child Prompt ID',
            'References the specific child prompt that was executed as part of hierarchical prompt composition. NULL for regular prompts or parent prompts that don''t directly execute a child.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
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

/* SQL text to delete entity field value ID 97D3443E-F36B-1410-8DBA-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='97D3443E-F36B-1410-8DBA-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='21D4443E-F36B-1410-8DBA-00021F8B792E'

/* SQL text to delete entity field value ID ABD3443E-F36B-1410-8DBA-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='ABD3443E-F36B-1410-8DBA-00021F8B792E'

/* SQL text to update entity field related entity name field map for entity field ID B8CD443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B8CD443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 12CE443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='12CE443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID C8CD443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C8CD443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 17CE443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='17CE443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID CCCD443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CCCD443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 9CCB443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9CCB443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID D2CB443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D2CB443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID FCCB443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FCCB443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID D8CB443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D8CB443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID DECB443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DECB443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 7ACC443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7ACC443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID E6CC443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E6CC443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 2ECD443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2ECD443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 52CD443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='52CD443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

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

/* SQL text to update entity field related entity name field map for entity field ID 2CD14363-BDDB-45BA-AEDE-731EE053CAB1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2CD14363-BDDB-45BA-AEDE-731EE053CAB1',
         @RelatedEntityNameFieldMap='ChildPrompt'

/* SQL text to update entity field related entity name field map for entity field ID F8CC443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F8CC443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

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
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPromptRuns]
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
    AIModel_OriginalModelID.[Name] AS [OriginalModel],
    AIPrompt_JudgeID.[Name] AS [Judge],
    AIPrompt_ChildPromptID.[Name] AS [ChildPrompt]
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
    [${flyway:defaultSchema}].[AIModel] AS AIModel_OriginalModelID
  ON
    [a].[OriginalModelID] = AIModel_OriginalModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_JudgeID
  ON
    [a].[JudgeID] = AIPrompt_JudgeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ChildPromptID
  ON
    [a].[ChildPromptID] = AIPrompt_ChildPromptID.[ID]
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun]
    @ID uniqueidentifier = NULL,
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
    @FirstAttemptAt datetime,
    @LastAttemptAt datetime,
    @TotalRetryDurationMS int,
    @ValidationAttempts nvarchar(MAX),
    @ValidationSummary nvarchar(MAX),
    @FailoverAttempts int,
    @FailoverErrors nvarchar(MAX),
    @FailoverDurations nvarchar(MAX),
    @OriginalModelID uniqueidentifier,
    @OriginalRequestStartTime datetime,
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
    @ChildPromptID uniqueidentifier
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
                [ChildPromptID]
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
                @RunAt,
                @CompletedAt,
                @ExecutionTimeMS,
                @Messages,
                @Result,
                @TokensUsed,
                @TokensPrompt,
                @TokensCompletion,
                @TotalCost,
                @Success,
                @ErrorMessage,
                @ParentID,
                @RunType,
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
                @Status,
                @Cancelled,
                @CancellationReason,
                @ModelPowerRank,
                @SelectionStrategy,
                @CacheHit,
                @CacheKey,
                @JudgeID,
                @JudgeScore,
                @WasSelectedResult,
                @StreamingEnabled,
                @FirstTokenTime,
                @ErrorDetails,
                @ChildPromptID
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
                [ChildPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptID,
                @ModelID,
                @VendorID,
                @AgentID,
                @ConfigurationID,
                @RunAt,
                @CompletedAt,
                @ExecutionTimeMS,
                @Messages,
                @Result,
                @TokensUsed,
                @TokensPrompt,
                @TokensCompletion,
                @TotalCost,
                @Success,
                @ErrorMessage,
                @ParentID,
                @RunType,
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
                @Status,
                @Cancelled,
                @CancellationReason,
                @ModelPowerRank,
                @SelectionStrategy,
                @CacheHit,
                @CacheKey,
                @JudgeID,
                @JudgeScore,
                @WasSelectedResult,
                @StreamingEnabled,
                @FirstTokenTime,
                @ErrorDetails,
                @ChildPromptID
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPromptRun]
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
    @FirstAttemptAt datetime,
    @LastAttemptAt datetime,
    @TotalRetryDurationMS int,
    @ValidationAttempts nvarchar(MAX),
    @ValidationSummary nvarchar(MAX),
    @FailoverAttempts int,
    @FailoverErrors nvarchar(MAX),
    @FailoverDurations nvarchar(MAX),
    @OriginalModelID uniqueidentifier,
    @OriginalRequestStartTime datetime,
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
    @ChildPromptID uniqueidentifier
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
        [ChildPromptID] = @ChildPromptID
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
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPromptRun
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



/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID FECC443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FECC443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 04CD443E-F36B-1410-8DBA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='04CD443E-F36B-1410-8DBA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6ee88511-ce87-4ba6-aa0f-da675c5c757b'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'ChildPrompt')
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
            '6ee88511-ce87-4ba6-aa0f-da675c5c757b',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100084,
            'ChildPrompt',
            'Child Prompt',
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

