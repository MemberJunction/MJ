/*
   Add SuggestedResponses field to ConversationDetail table

   This field stores a JSON array of suggested response options that can be displayed
   to the user for quick replies in the conversation UI. Each suggested response can
   be a simple button or an input field with placeholder text.

   Example JSON structure:
   [
     {
       "text": "Market trends for renewable energy in 2025",
       "allowInput": false,
       "iconClass": "fa fa-leaf"
     },
     {
       "text": "Custom topic (please specify)",
       "allowInput": true,
       "iconClass": "fa fa-pencil"
     }
   ]

   Migration for MemberJunction v2.108.x
   Date: 2025-10-16
*/

-- Add SuggestedResponses column to ConversationDetail table
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
ADD [SuggestedResponses] NVARCHAR(MAX) NULL;
GO

-- Add extended property description for the column
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of suggested responses that can be displayed to the user for quick replies. Each response object contains: text (display text), allowInput (boolean), iconClass (optional Font Awesome class), and data (optional payload).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ConversationDetail',
    @level2type = N'COLUMN', @level2name = 'SuggestedResponses';
GO





























































-- CODE GEN RUN 
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '79639f85-7b4a-4aca-89b3-3d043d0ae9fb'  OR 
               (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SuggestedResponses')
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
            '79639f85-7b4a-4aca-89b3-3d043d0ae9fb',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversation Details
            100048,
            'SuggestedResponses',
            'Suggested Responses',
            'JSON array of suggested responses that can be displayed to the user for quick replies. Each response object contains: text (display text), allowInput (boolean), iconClass (optional Font Awesome class), and data (optional payload).',
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

/* SQL text to update entity field related entity name field map for entity field ID 6900453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6900453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 8D00453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8D00453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 2100453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2100453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID D7FE443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D7FE443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 37FF443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='37FF443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 3300453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3300453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 3900453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3900453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 3F00453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3F00453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 0DFF443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0DFF443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID B5FF443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B5FF443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

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

-- Index for foreign key ParentID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID ON [${flyway:defaultSchema}].[ConversationDetail] ([ParentID]);

-- Index for foreign key AgentID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID ON [${flyway:defaultSchema}].[ConversationDetail] ([AgentID]);

/* Root ID Function SQL for Conversation Details.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: fnConversationDetailParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ConversationDetail].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]
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
            [${flyway:defaultSchema}].[ConversationDetail]
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
            [${flyway:defaultSchema}].[ConversationDetail] c
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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetails]
AS
SELECT
    c.*,
    Conversation_ConversationID.[Name] AS [Conversation],
    User_UserID.[Name] AS [User],
    ConversationArtifact_ArtifactID.[Name] AS [Artifact],
    AIAgent_AgentID.[Name] AS [Agent],
    root_ParentID.RootID AS [RootParentID]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [c].[AgentID] = AIAgent_AgentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit = NULL,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint,
    @IsPinned bit = NULL,
    @ParentID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ID],
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
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                @ExternalID,
                ISNULL(@Role, user_name()),
                @Message,
                @Error,
                ISNULL(@HiddenToUser, 0),
                @UserRating,
                @UserFeedback,
                @ReflectionInsights,
                @SummaryOfEarlierConversation,
                @UserID,
                @ArtifactID,
                @ArtifactVersionID,
                @CompletionTime,
                ISNULL(@IsPinned, 0),
                @ParentID,
                @AgentID,
                ISNULL(@Status, 'Complete'),
                @SuggestedResponses
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
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
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                @ExternalID,
                ISNULL(@Role, user_name()),
                @Message,
                @Error,
                ISNULL(@HiddenToUser, 0),
                @UserRating,
                @UserFeedback,
                @ReflectionInsights,
                @SummaryOfEarlierConversation,
                @UserID,
                @ArtifactID,
                @ArtifactVersionID,
                @CompletionTime,
                ISNULL(@IsPinned, 0),
                @ParentID,
                @AgentID,
                ISNULL(@Status, 'Complete'),
                @SuggestedResponses
            )
    END
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail];
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
    @CompletionTime bigint,
    @IsPinned bit,
    @ParentID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(20),
    @SuggestedResponses nvarchar(MAX)
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
        [CompletionTime] = @CompletionTime,
        [IsPinned] = @IsPinned,
        [ParentID] = @ParentID,
        [AgentID] = @AgentID,
        [Status] = @Status,
        [SuggestedResponses] = @SuggestedResponses
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationDetail];
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



/* spDelete SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
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
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE @ConversationDetails_SuggestedResponses nvarchar(MAX)
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ParentID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJ_ConversationDetailArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJ_ConversationDetailArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJ_TasksID uniqueidentifier
    DECLARE @MJ_Tasks_ParentID uniqueidentifier
    DECLARE @MJ_Tasks_Name nvarchar(255)
    DECLARE @MJ_Tasks_Description nvarchar(MAX)
    DECLARE @MJ_Tasks_TypeID uniqueidentifier
    DECLARE @MJ_Tasks_EnvironmentID uniqueidentifier
    DECLARE @MJ_Tasks_ProjectID uniqueidentifier
    DECLARE @MJ_Tasks_ConversationDetailID uniqueidentifier
    DECLARE @MJ_Tasks_UserID uniqueidentifier
    DECLARE @MJ_Tasks_AgentID uniqueidentifier
    DECLARE @MJ_Tasks_Status nvarchar(50)
    DECLARE @MJ_Tasks_PercentComplete int
    DECLARE @MJ_Tasks_DueAt datetimeoffset
    DECLARE @MJ_Tasks_StartedAt datetimeoffset
    DECLARE @MJ_Tasks_CompletedAt datetimeoffset
    DECLARE cascade_update_MJ_Tasks_cursor CURSOR FOR 
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_Tasks_cursor
    FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_Tasks_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJ_TasksID, @ParentID = @MJ_Tasks_ParentID, @Name = @MJ_Tasks_Name, @Description = @MJ_Tasks_Description, @TypeID = @MJ_Tasks_TypeID, @EnvironmentID = @MJ_Tasks_EnvironmentID, @ProjectID = @MJ_Tasks_ProjectID, @ConversationDetailID = @MJ_Tasks_ConversationDetailID, @UserID = @MJ_Tasks_UserID, @AgentID = @MJ_Tasks_AgentID, @Status = @MJ_Tasks_Status, @PercentComplete = @MJ_Tasks_PercentComplete, @DueAt = @MJ_Tasks_DueAt, @StartedAt = @MJ_Tasks_StartedAt, @CompletedAt = @MJ_Tasks_CompletedAt
        
        FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    END
    
    CLOSE cascade_update_MJ_Tasks_cursor
    DEALLOCATE cascade_update_MJ_Tasks_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 13FF443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='13FF443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 19FF443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='19FF443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Sequence int = NULL,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit = NULL,
    @IncludeInParentAllQuery bit = NULL,
    @Type nchar(20) = NULL,
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit = NULL,
    @DisplayLocation nvarchar(50) = NULL,
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50) = NULL,
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [ID],
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
                @ID,
                @EntityID,
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
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
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1)
            )
    END
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship];
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

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityRelationship]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityRelationship];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship];
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


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* SQL text to update entity field related entity name field map for entity field ID 1E01453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1E01453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 2301453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2301453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID FD00453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FD00453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 0101453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0101453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 0201453E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0201453E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* spDelete SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE @ConversationDetails_SuggestedResponses nvarchar(MAX)
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactVersionID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ArtifactVersionID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Integration]



/* spDelete SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE @ConversationDetails_SuggestedResponses nvarchar(MAX)
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ArtifactID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade delete from ConversationArtifactPermission using cursor to call spDeleteConversationArtifactPermission
    DECLARE @MJ_ConversationArtifactPermissionsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifactPermissions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactPermission]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifactPermissions_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactPermissions_cursor INTO @MJ_ConversationArtifactPermissionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] @ID = @MJ_ConversationArtifactPermissionsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactPermissions_cursor INTO @MJ_ConversationArtifactPermissionsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifactPermissions_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifactPermissions_cursor
    
    -- Cascade delete from ConversationArtifactVersion using cursor to call spDeleteConversationArtifactVersion
    DECLARE @MJ_ConversationArtifactVersionsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifactVersions_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactVersion]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifactVersions_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactVersions_cursor INTO @MJ_ConversationArtifactVersionsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] @ID = @MJ_ConversationArtifactVersionsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifactVersions_cursor INTO @MJ_ConversationArtifactVersionsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifactVersions_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifactVersions_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Integration]



/* spDelete SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
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
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE cascade_delete_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_ConversationDetails_cursor
    FETCH NEXT FROM cascade_delete_ConversationDetails_cursor INTO @ConversationDetailsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetail] @ID = @ConversationDetailsID
        
        FETCH NEXT FROM cascade_delete_ConversationDetails_cursor INTO @ConversationDetailsID
    END
    
    CLOSE cascade_delete_ConversationDetails_cursor
    DEALLOCATE cascade_delete_ConversationDetails_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact
    DECLARE @MJ_ConversationArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifact]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifacts_cursor INTO @MJ_ConversationArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifact] @ID = @MJ_ConversationArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifacts_cursor INTO @MJ_ConversationArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifacts_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



