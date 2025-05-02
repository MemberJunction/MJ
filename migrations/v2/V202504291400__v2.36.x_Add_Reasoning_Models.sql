-- Add EffortLevel to AIModel table
ALTER TABLE [${flyway:defaultSchema}].[AIModel] ADD SupportsEffortLevel BIT NOT NULL DEFAULT 0
GO

-- Extended property for SupportsEffortLevel column 
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Specifies if the model supports the concept of an effort level. For example, for a reasoning model, the options often include low, medium, and high.', 
    @level0type = N'Schema', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = N'AIModel',
    @level2type = N'Column', @level2name = N'SupportsEffortLevel';

-- Add reasoning models to AIModel table
INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('5A4DF845-F821-F011-8B3D-000D3A9E3408'
           ,'Gemini 2.0 Flash'
           ,'Next-gen features and improved capabilities, including superior speed, native tool use, multimodal generation, and a 1M token context window.'
           ,'Google'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'GeminiLLM'
           ,NULL
           ,'gemini-2.0-flash'
           ,'2025-04-25 17:11:06.7966667 +00:00'
           ,'2025-04-25 17:11:06.7966667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,1048576
           ,'Any, JSON',
           0);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('0C93395D-F821-F011-8B3D-000D3A9E3408'
           ,'Gemini 2.0 Flash-Lite'
           ,'A Gemini 2.0 Flash model optimized for cost efficiency and low latency.'
           ,'Google'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'GeminiLLM'
           ,NULL
           ,'gemini-2.0-flash-lite'
           ,'2025-04-25 17:11:45.8133333 +00:00'
           ,'2025-04-25 17:11:45.8133333 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,1048576
           ,'Any, JSON', 
           0);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('791C357A-F821-F011-8B3D-000D3A9E3408'
           ,'Gemini 1.5 Flash'
           ,'Gemini 1.5 Flash is a fast and versatile multimodal model for scaling across diverse tasks.'
           ,'Google'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'GeminiLLM'
           ,NULL
           ,'gemini-1.5-flash'
           ,'2025-04-25 17:12:34.4366667 +00:00'
           ,'2025-04-25 17:12:34.4366667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,1048576
           ,'Any, JSON',
           0);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('9604B1A4-3A21-F011-8B3D-7C1E5249773E'
           ,'4.1 mini'
           ,'GPT-4.1 mini provides a balance between intelligence, speed, and cost that makes it an attractive model for many use cases.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,4
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'gpt-4.1-mini'
           ,'2025-04-24 18:33:41.3400000 +00:00'
           ,'2025-04-24 18:33:41.3400000 +00:00'
           ,0
           ,0
           ,NULL
           ,1000000
           ,'Any, JSON',
           0);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('E1095D3C-E821-F011-8B3D-000D3A9E3408'
           ,'o4-mini'
           ,'Smaller model optimized for fast, cost-efficient reasoning'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,6
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o4-mini'
           ,'2025-04-25 15:16:18.7366667 +00:00'
           ,'2025-04-25 15:16:18.7366667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('03080654-F721-F011-8B3D-000D3A9E3408'
           ,'o3'
           ,'Well-rounded and powerful model across domains. It sets a new standard for math, science, coding, and visual reasoning tasks. It also excels at technical writing and instruction-following. Use it to think through multi-step problems that involve analysis across text, code, and images.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o3'
           ,'2025-04-25 17:04:20.8766667 +00:00'
           ,'2025-04-25 17:04:20.8766667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('A647667B-F721-F011-8B3D-000D3A9E3408'
           ,'o3-mini'
           ,'small reasoning model, providing high intelligence at the same cost and latency targets of o1-mini. o3-mini supports key developer features, like Structured Outputs, function calling, and Batch API.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o3-mini'
           ,'2025-04-25 17:05:26.9400000 +00:00'
           ,'2025-04-25 17:05:26.9400000 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('D8B332B2-F721-F011-8B3D-000D3A9E3408'
           ,'o1'
           ,'The o1 series of models are trained with reinforcement learning to perform complex reasoning. o1 models think before they answer, producing a long internal chain of thought before responding to the user.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o1'
           ,'2025-04-25 17:06:58.8866667 +00:00'
           ,'2025-04-25 17:06:58.8866667 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('E54347C3-F721-F011-8B3D-000D3A9E3408'
           ,'o1-mini'
           ,'The o1 reasoning model is designed to solve hard problems across domains. o1-mini is a faster and more affordable reasoning model, but we recommend using the newer o3-mini model that features higher intelligence at the same latency and price as o1-mini.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o1-mini'
           ,'2025-04-25 17:07:27.5333333 +00:00'
           ,'2025-04-25 17:07:27.5333333 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('913EC3DB-F721-F011-8B3D-000D3A9E3408'
           ,'o1-pro'
           ,'Version of o1 with more compute for better responses'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'o1-pro'
           ,'2025-04-25 17:08:08.6133333 +00:00'
           ,'2025-04-25 17:08:08.6133333 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,200000
           ,'Any, JSON',
           1);

INSERT INTO [${flyway:defaultSchema}].[AIModel]
           ([ID]
           ,[Name]
           ,[Description]
           ,[Vendor]
           ,[AIModelTypeID]
           ,[PowerRank]
           ,[IsActive]
           ,[DriverClass]
           ,[DriverImportPath]
           ,[APIName]
           ,[__mj_CreatedAt]
           ,[__mj_UpdatedAt]
           ,[SpeedRank]
           ,[CostRank]
           ,[ModelSelectionInsights]
           ,[InputTokenLimit]
           ,[SupportedResponseFormats]
           ,[SupportsEffortLevel])
     VALUES
           ('287E317F-BF26-F011-A770-AC1A3D21423D'
           ,'4.1'
           ,'Flagship model for complex tasks. It is well suited for problem solving across domains.'
           ,'OpenAI'
           ,'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'
           ,8
           ,1
           ,'OpenAILLM'
           ,NULL
           ,'gpt-4.1-2025-04-14'
           ,'2025-04-25 17:08:08.6133333 +00:00'
           ,'2025-04-25 17:08:08.6133333 +00:00'
           ,NULL
           ,NULL
           ,NULL
           ,1047576
           ,'Any, JSON',
           1);

-- The AIAgentNoteType table is an existing table but previously had no data in it. Here we add two new types of notes: Human and AI.
-- Human notes are notes that are written and added by a human user, and must not be modified by AI learning cycles. 
-- AI notes are notes that are written and added by AI during learning cycles, and may be added, updated, or deleted by the AI.  
-- Add Agent Note Types for Skip
INSERT INTO [${flyway:defaultSchema}].[AIAgentNoteType]
           ([ID]
           ,[Name]
           ,[Description])
     VALUES
           ('C49BBEA7-5424-F011-A770-AC1A3D21423D'
           ,'Human'
           ,'Notes added by a Human')

INSERT INTO [${flyway:defaultSchema}].[AIAgentNoteType]
           ([ID]
           ,[Name]
           ,[Description])
     VALUES
           ('C59BBEA7-5424-F011-A770-AC1A3D21423D'
           ,'AI'
           ,'Notes added by an AI')

-- Generated by CodeGen
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a7850674-d31f-4669-8f25-30d9f581e873'  OR 
               (EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SupportsEffortLevel')
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
            'a7850674-d31f-4669-8f25-30d9f581e873',
            'FD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: AI Models
            18,
            'SupportsEffortLevel',
            'Supports Effort Level',
            'Specifies if the model supports the concept of an effort level. For example, for a reasoning model, the options often include low, medium, and high.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

/* Index for Foreign Keys for AIAgentNote */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_AgentID ON [${flyway:defaultSchema}].[AIAgentNote] ([AgentID]);

-- Index for foreign key AgentNoteTypeID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_AgentNoteTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_AgentNoteTypeID ON [${flyway:defaultSchema}].[AIAgentNote] ([AgentNoteTypeID]);

-- Index for foreign key UserID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_UserID ON [${flyway:defaultSchema}].[AIAgentNote] ([UserID]);

/* Base View SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agent Notes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentNote
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentNotes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentNotes]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIAgentNoteType_AgentNoteTypeID.[Name] AS [AgentNoteType],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[AIAgentNote] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIAgentNoteType] AS AIAgentNoteType_AgentNoteTypeID
  ON
    [a].[AgentNoteTypeID] = AIAgentNoteType_AgentNoteTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: Permissions for vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: spCreateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentNote]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote]
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX),
    @Type nvarchar(20),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentNote]
        (
            [AgentID],
            [AgentNoteTypeID],
            [Note],
            [Type],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AgentID,
            @AgentNoteTypeID,
            @Note,
            @Type,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: spUpdateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentNote]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX),
    @Type nvarchar(20),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        [AgentID] = @AgentID,
        [AgentNoteTypeID] = @AgentNoteTypeID,
        [Note] = @Note,
        [Type] = @Type,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentNotes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentNote
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentNote
ON [${flyway:defaultSchema}].[AIAgentNote]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentNote] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: spDeleteAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentNote]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentNote]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentNote]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Integration]



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

/* Base View SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: vwAIModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Models
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModels]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModels]
AS
SELECT
    a.*,
    AIModelType_AIModelTypeID.[Name] AS [AIModelType]
FROM
    [${flyway:defaultSchema}].[AIModel] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModelType] AS AIModelType_AIModelTypeID
  ON
    [a].[AIModelTypeID] = AIModelType_AIModelTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

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
    @Vendor nvarchar(50),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @SpeedRank int,
    @CostRank int,
    @ModelSelectionInsights nvarchar(MAX),
    @InputTokenLimit int,
    @SupportedResponseFormats nvarchar(100),
    @SupportsEffortLevel bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModel]
        (
            [Name],
            [Description],
            [Vendor],
            [AIModelTypeID],
            [PowerRank],
            [IsActive],
            [DriverClass],
            [DriverImportPath],
            [APIName],
            [SpeedRank],
            [CostRank],
            [ModelSelectionInsights],
            [InputTokenLimit],
            [SupportedResponseFormats],
            [SupportsEffortLevel]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Vendor,
            @AIModelTypeID,
            @PowerRank,
            @IsActive,
            @DriverClass,
            @DriverImportPath,
            @APIName,
            @SpeedRank,
            @CostRank,
            @ModelSelectionInsights,
            @InputTokenLimit,
            @SupportedResponseFormats,
            @SupportsEffortLevel
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
    @Vendor nvarchar(50),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @SpeedRank int,
    @CostRank int,
    @ModelSelectionInsights nvarchar(MAX),
    @InputTokenLimit int,
    @SupportedResponseFormats nvarchar(100),
    @SupportsEffortLevel bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModel]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Vendor] = @Vendor,
        [AIModelTypeID] = @AIModelTypeID,
        [PowerRank] = @PowerRank,
        [IsActive] = @IsActive,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [APIName] = @APIName,
        [SpeedRank] = @SpeedRank,
        [CostRank] = @CostRank,
        [ModelSelectionInsights] = @ModelSelectionInsights,
        [InputTokenLimit] = @InputTokenLimit,
        [SupportedResponseFormats] = @SupportedResponseFormats,
        [SupportsEffortLevel] = @SupportsEffortLevel
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