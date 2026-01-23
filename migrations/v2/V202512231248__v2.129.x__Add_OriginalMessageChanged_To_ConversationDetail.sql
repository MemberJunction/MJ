-- Migration: Add OriginalMessageChanged column to Conversation Details table
-- Purpose: Track when a user has edited their original message content
-- This allows the UI to show "(Edited)" indicator only when actual message content changed,
-- not just when metadata was updated (which would cause CreatedAt != UpdatedAt)

-- Add the OriginalMessageChanged column
ALTER TABLE ${flyway:defaultSchema}.[ConversationDetail]
ADD OriginalMessageChanged BIT NOT NULL DEFAULT 0;

-- Add extended property for the column description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if the original message content was modified after initial creation. Set automatically by the server when the Message field is changed on update.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetail',
    @level2type = N'COLUMN', @level2name = 'OriginalMessageChanged';

























-- CODE GEN RUN
 /* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f99f9670-a9a8-44be-8f4f-1c3138490591'  OR 
               (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'OriginalMessageChanged')
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
            'f99f9670-a9a8-44be-8f4f-1c3138490591',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversation Details
            100060,
            'OriginalMessageChanged',
            'Original Message Changed',
            'Indicates if the original message content was modified after initial creation. Set automatically by the server when the Message field is changed on update.',
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

/* SQL text to update entity field related entity name field map for entity field ID BDA1916F-A9ED-4076-8655-BF591362FD58 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BDA1916F-A9ED-4076-8655-BF591362FD58',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID CCAA0138-EAAC-4996-90B1-5E7CCD51DF23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CCAA0138-EAAC-4996-90B1-5E7CCD51DF23',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 870EB82D-82E6-4C4A-BE55-41913679EA16 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='870EB82D-82E6-4C4A-BE55-41913679EA16',
         @RelatedEntityNameFieldMap='GovernmentContact'

/* SQL text to update entity field related entity name field map for entity field ID 7A6D693E-EE9D-44CB-B457-C390B26D899F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7A6D693E-EE9D-44CB-B457-C390B26D899F',
         @RelatedEntityNameFieldMap='BoardPosition'

/* SQL text to update entity field related entity name field map for entity field ID 03771F00-9FC6-40AC-A43E-4D4A1C681CC4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='03771F00-9FC6-40AC-A43E-4D4A1C681CC4',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 891CDB72-83C4-409F-A4FE-B57D33A82845 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='891CDB72-83C4-409F-A4FE-B57D33A82845',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID E6A02A04-19F3-4CB0-B54E-43D18D1CD98A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E6A02A04-19F3-4CB0-B54E-43D18D1CD98A',
         @RelatedEntityNameFieldMap='Enrollment'

/* SQL text to update entity field related entity name field map for entity field ID 08F4783E-23DC-4849-A3B3-8439CFB1F910 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='08F4783E-23DC-4849-A3B3-8439CFB1F910',
         @RelatedEntityNameFieldMap='Certification'

/* SQL text to update entity field related entity name field map for entity field ID 14CB8593-2AD8-4106-A8A3-05ADF2C96008 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='14CB8593-2AD8-4106-A8A3-05ADF2C96008',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID EBAE77D2-BE2A-43CE-8039-76AB191575E5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EBAE77D2-BE2A-43CE-8039-76AB191575E5',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID D4C63174-DA68-460A-B323-2656EFD74959 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D4C63174-DA68-460A-B323-2656EFD74959',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID CCB3A932-D564-461E-8592-0B1DEE0530AC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CCB3A932-D564-461E-8592-0B1DEE0530AC',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 0E41C2AA-ADDA-4FF8-8CAD-FE85B05639ED */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0E41C2AA-ADDA-4FF8-8CAD-FE85B05639ED',
         @RelatedEntityNameFieldMap='ChairMember'

/* SQL text to update entity field related entity name field map for entity field ID 86691FA6-C03B-4608-A135-EF1A25FD99E7 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='86691FA6-C03B-4608-A135-EF1A25FD99E7',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID B14C5194-405F-4FD5-9354-3D1ED1DE8945 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B14C5194-405F-4FD5-9354-3D1ED1DE8945',
         @RelatedEntityNameFieldMap='Member'

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

-- Index for foreign key TestRunID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID ON [${flyway:defaultSchema}].[ConversationDetail] ([TestRunID]);

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
    ConversationArtifactVersion_ArtifactVersionID.[ConversationArtifact] AS [ArtifactVersion],
    ConversationDetail_ParentID.[Message] AS [Parent],
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
    [${flyway:defaultSchema}].[vwConversationArtifactVersions] AS ConversationArtifactVersion_ArtifactVersionID
  ON
    [c].[ArtifactVersionID] = ConversationArtifactVersion_ArtifactVersionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS ConversationDetail_ParentID
  ON
    [c].[ParentID] = ConversationDetail_ParentID.[ID]
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
    @SuggestedResponses nvarchar(MAX),
    @TestRunID uniqueidentifier,
    @ResponseForm nvarchar(MAX),
    @ActionableCommands nvarchar(MAX),
    @AutomaticCommands nvarchar(MAX),
    @OriginalMessageChanged bit = NULL
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
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged]
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
                @SuggestedResponses,
                @TestRunID,
                @ResponseForm,
                @ActionableCommands,
                @AutomaticCommands,
                ISNULL(@OriginalMessageChanged, 0)
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
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged]
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
                @SuggestedResponses,
                @TestRunID,
                @ResponseForm,
                @ActionableCommands,
                @AutomaticCommands,
                ISNULL(@OriginalMessageChanged, 0)
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
    @SuggestedResponses nvarchar(MAX),
    @TestRunID uniqueidentifier,
    @ResponseForm nvarchar(MAX),
    @ActionableCommands nvarchar(MAX),
    @AutomaticCommands nvarchar(MAX),
    @OriginalMessageChanged bit
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
        [SuggestedResponses] = @SuggestedResponses,
        [TestRunID] = @TestRunID,
        [ResponseForm] = @ResponseForm,
        [ActionableCommands] = @ActionableCommands,
        [AutomaticCommands] = @AutomaticCommands,
        [OriginalMessageChanged] = @OriginalMessageChanged
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
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @AIAgentNotesID uniqueidentifier
    DECLARE @AIAgentNotes_AgentID uniqueidentifier
    DECLARE @AIAgentNotes_AgentNoteTypeID uniqueidentifier
    DECLARE @AIAgentNotes_Note nvarchar(MAX)
    DECLARE @AIAgentNotes_UserID uniqueidentifier
    DECLARE @AIAgentNotes_Type nvarchar(20)
    DECLARE @AIAgentNotes_IsAutoGenerated bit
    DECLARE @AIAgentNotes_Comments nvarchar(MAX)
    DECLARE @AIAgentNotes_Status nvarchar(20)
    DECLARE @AIAgentNotes_SourceConversationID uniqueidentifier
    DECLARE @AIAgentNotes_SourceConversationDetailID uniqueidentifier
    DECLARE @AIAgentNotes_SourceAIAgentRunID uniqueidentifier
    DECLARE @AIAgentNotes_CompanyID uniqueidentifier
    DECLARE @AIAgentNotes_EmbeddingVector nvarchar(MAX)
    DECLARE @AIAgentNotes_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_AIAgentNotes_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_AIAgentNotes_cursor
    FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @AIAgentNotes_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @AIAgentNotesID, @AgentID = @AIAgentNotes_AgentID, @AgentNoteTypeID = @AIAgentNotes_AgentNoteTypeID, @Note = @AIAgentNotes_Note, @UserID = @AIAgentNotes_UserID, @Type = @AIAgentNotes_Type, @IsAutoGenerated = @AIAgentNotes_IsAutoGenerated, @Comments = @AIAgentNotes_Comments, @Status = @AIAgentNotes_Status, @SourceConversationID = @AIAgentNotes_SourceConversationID, @SourceConversationDetailID = @AIAgentNotes_SourceConversationDetailID, @SourceAIAgentRunID = @AIAgentNotes_SourceAIAgentRunID, @CompanyID = @AIAgentNotes_CompanyID, @EmbeddingVector = @AIAgentNotes_EmbeddingVector, @EmbeddingModelID = @AIAgentNotes_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    END
    
    CLOSE cascade_update_AIAgentNotes_cursor
    DEALLOCATE cascade_update_AIAgentNotes_cursor
    
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
    DECLARE @ConversationDetails_TestRunID uniqueidentifier
    DECLARE @ConversationDetails_ResponseForm nvarchar(MAX)
    DECLARE @ConversationDetails_ActionableCommands nvarchar(MAX)
    DECLARE @ConversationDetails_AutomaticCommands nvarchar(MAX)
    DECLARE @ConversationDetails_OriginalMessageChanged bit
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ParentID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses, @TestRunID = @ConversationDetails_TestRunID, @ResponseForm = @ConversationDetails_ResponseForm, @ActionableCommands = @ConversationDetails_ActionableCommands, @AutomaticCommands = @ConversationDetails_AutomaticCommands, @OriginalMessageChanged = @ConversationDetails_OriginalMessageChanged
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJ_AIAgentExamplesID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_UserID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_CompanyID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_Type nvarchar(20)
    DECLARE @MJ_AIAgentExamples_ExampleInput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_ExampleOutput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_IsAutoGenerated bit
    DECLARE @MJ_AIAgentExamples_SourceConversationID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SuccessScore decimal(5, 2)
    DECLARE @MJ_AIAgentExamples_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_Status nvarchar(20)
    DECLARE @MJ_AIAgentExamples_EmbeddingVector nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentExamples_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentExamples_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentExamples_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJ_AIAgentExamplesID, @AgentID = @MJ_AIAgentExamples_AgentID, @UserID = @MJ_AIAgentExamples_UserID, @CompanyID = @MJ_AIAgentExamples_CompanyID, @Type = @MJ_AIAgentExamples_Type, @ExampleInput = @MJ_AIAgentExamples_ExampleInput, @ExampleOutput = @MJ_AIAgentExamples_ExampleOutput, @IsAutoGenerated = @MJ_AIAgentExamples_IsAutoGenerated, @SourceConversationID = @MJ_AIAgentExamples_SourceConversationID, @SourceConversationDetailID = @MJ_AIAgentExamples_SourceConversationDetailID, @SourceAIAgentRunID = @MJ_AIAgentExamples_SourceAIAgentRunID, @SuccessScore = @MJ_AIAgentExamples_SuccessScore, @Comments = @MJ_AIAgentExamples_Comments, @Status = @MJ_AIAgentExamples_Status, @EmbeddingVector = @MJ_AIAgentExamples_EmbeddingVector, @EmbeddingModelID = @MJ_AIAgentExamples_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    END
    
    CLOSE cascade_update_MJ_AIAgentExamples_cursor
    DEALLOCATE cascade_update_MJ_AIAgentExamples_cursor
    
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
    DECLARE @MJ_AIAgentRuns_TestRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID, @TestRunID = @MJ_AIAgentRuns_TestRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
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
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJ_ConversationDetailRatingsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailRatings_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailRatings_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJ_ConversationDetailRatingsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailRatings_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailRatings_cursor
    
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



/* SQL text to update entity field related entity name field map for entity field ID 3D89BECF-6A67-40B4-958F-05A548BDA16E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3D89BECF-6A67-40B4-958F-05A548BDA16E',
         @RelatedEntityNameFieldMap='Certification'

/* SQL text to update entity field related entity name field map for entity field ID D3AEEA54-917F-4D17-9097-995EA9DC607F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D3AEEA54-917F-4D17-9097-995EA9DC607F',
         @RelatedEntityNameFieldMap='PrerequisiteCourse'

/* SQL text to update entity field related entity name field map for entity field ID A47AD41A-558B-44DA-B802-9DEF8FAD13C5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A47AD41A-558B-44DA-B802-9DEF8FAD13C5',
         @RelatedEntityNameFieldMap='EmailSend'

/* SQL text to update entity field related entity name field map for entity field ID B27576EB-A8C5-41C5-8F63-097337241263 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B27576EB-A8C5-41C5-8F63-097337241263',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 11396F6F-F374-4B14-A7EF-2CA3EF1FB9DE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='11396F6F-F374-4B14-A7EF-2CA3EF1FB9DE',
         @RelatedEntityNameFieldMap='Course'

/* SQL text to update entity field related entity name field map for entity field ID 0097BCC7-AD8C-46A1-98B4-66C44A6F09A0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0097BCC7-AD8C-46A1-98B4-66C44A6F09A0',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID A7F75389-F28C-467F-86FD-3F327851BADE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A7F75389-F28C-467F-86FD-3F327851BADE',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID CE4ACFFA-01C8-4AF5-BADF-8B2F66F38940 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CE4ACFFA-01C8-4AF5-BADF-8B2F66F38940',
         @RelatedEntityNameFieldMap='LastPostAuthor'

/* SQL text to update entity field related entity name field map for entity field ID 7A2F7597-971D-4DEA-89D2-061529D1AD02 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7A2F7597-971D-4DEA-89D2-061529D1AD02',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID 2B79487E-0ACB-470E-9BEF-DE3C1F456D3C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2B79487E-0ACB-470E-9BEF-DE3C1F456D3C',
         @RelatedEntityNameFieldMap='Thread'

/* SQL text to update entity field related entity name field map for entity field ID 0EB8451F-CB0B-41E3-8D19-059626D8FE1C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0EB8451F-CB0B-41E3-8D19-059626D8FE1C',
         @RelatedEntityNameFieldMap='ReportedBy'

/* SQL text to update entity field related entity name field map for entity field ID 4DC1AD7D-26D2-40F9-8D3E-53BFAEFB39D2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4DC1AD7D-26D2-40F9-8D3E-53BFAEFB39D2',
         @RelatedEntityNameFieldMap='ParentPost'

/* SQL text to update entity field related entity name field map for entity field ID 33625512-B33D-40BA-8DCA-9179DA979EE4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='33625512-B33D-40BA-8DCA-9179DA979EE4',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID 513EC1BF-E177-450F-8E12-AD0BAD7A118E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='513EC1BF-E177-450F-8E12-AD0BAD7A118E',
         @RelatedEntityNameFieldMap='ModeratedBy'

/* SQL text to update entity field related entity name field map for entity field ID E107903D-22F7-464B-94A7-A871D40A38E5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E107903D-22F7-464B-94A7-A871D40A38E5',
         @RelatedEntityNameFieldMap='EditedBy'

/* SQL text to update entity field related entity name field map for entity field ID A6E747A0-B826-4537-9B96-970892C7C8CE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A6E747A0-B826-4537-9B96-970892C7C8CE',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID FF769525-E688-4D08-9012-89C094FD7EA1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FF769525-E688-4D08-9012-89C094FD7EA1',
         @RelatedEntityNameFieldMap='LastReplyAuthor'

/* SQL text to update entity field related entity name field map for entity field ID E5EB73A5-11F2-49CB-B960-2D35B55D1868 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E5EB73A5-11F2-49CB-B960-2D35B55D1868',
         @RelatedEntityNameFieldMap='Invoice'

/* SQL text to update entity field related entity name field map for entity field ID BE2CC123-9ABF-4608-B5C4-3C0E351D7874 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BE2CC123-9ABF-4608-B5C4-3C0E351D7874',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 7B0A55C5-A766-4A8F-90EE-385901C85F59 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7B0A55C5-A766-4A8F-90EE-385901C85F59',
         @RelatedEntityNameFieldMap='Follower'

/* SQL text to update entity field related entity name field map for entity field ID 99EF4AAE-D96A-46D2-9569-81C9CE86D0AE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='99EF4AAE-D96A-46D2-9569-81C9CE86D0AE',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 3D2FC768-23FD-427C-8624-9A9A0F495BBE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3D2FC768-23FD-427C-8624-9A9A0F495BBE',
         @RelatedEntityNameFieldMap='Invoice'

/* SQL text to update entity field related entity name field map for entity field ID 6036026B-2A0B-4B4F-95F9-D4CF8B3E96A5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6036026B-2A0B-4B4F-95F9-D4CF8B3E96A5',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID 48E8CD5E-79F3-4434-A16C-053CC9349D68 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='48E8CD5E-79F3-4434-A16C-053CC9349D68',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID 71C1F7A0-6B1B-4EF4-9950-6A59E4E6AFAE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='71C1F7A0-6B1B-4EF4-9950-6A59E4E6AFAE',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID B39DF3DB-69DD-4EE3-A752-98715E166E79 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B39DF3DB-69DD-4EE3-A752-98715E166E79',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID ACC76863-0C1F-4DB7-A55A-51DFB68930F5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='ACC76863-0C1F-4DB7-A55A-51DFB68930F5',
         @RelatedEntityNameFieldMap='CompetitionEntry'

/* SQL text to update entity field related entity name field map for entity field ID 2A33A06F-DA4C-4160-B731-3DCB5A9C2406 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2A33A06F-DA4C-4160-B731-3DCB5A9C2406',
         @RelatedEntityNameFieldMap='UploadedBy'

/* SQL text to update entity field related entity name field map for entity field ID 43F5B758-AF92-4BCD-9E03-3370D64F13E2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='43F5B758-AF92-4BCD-9E03-3370D64F13E2',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 1E153603-D64A-47EB-A4C9-C47C3D0D10B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1E153603-D64A-47EB-A4C9-C47C3D0D10B9',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 4C2A4B5A-E0DB-4D82-B30F-19132A1B48DB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4C2A4B5A-E0DB-4D82-B30F-19132A1B48DB',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID 3976371E-608E-494D-B59C-5261D6E16E41 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3976371E-608E-494D-B59C-5261D6E16E41',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 0E6B6DEC-31A7-4287-8A7E-10D24E9FEC64 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0E6B6DEC-31A7-4287-8A7E-10D24E9FEC64',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 8540F1FB-E248-440E-9AE9-F85A1905B013 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8540F1FB-E248-440E-9AE9-F85A1905B013',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 78BCED89-ACC4-411A-B8FB-CA10CF467504 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='78BCED89-ACC4-411A-B8FB-CA10CF467504',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 9D8DEF31-CE0D-457A-B79E-69E712351644 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9D8DEF31-CE0D-457A-B79E-69E712351644',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID F3FCA55F-CED5-4E05-BFDA-E84D2E553037 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F3FCA55F-CED5-4E05-BFDA-E84D2E553037',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID 7EFDC89B-4C9C-4AD6-BCEF-E06196F70CA0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7EFDC89B-4C9C-4AD6-BCEF-E06196F70CA0',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID F10D87F8-A164-4F14-B8BD-0EFE2DBD0CD1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F10D87F8-A164-4F14-B8BD-0EFE2DBD0CD1',
         @RelatedEntityNameFieldMap='CreatedBy'

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
    DECLARE @ConversationDetails_TestRunID uniqueidentifier
    DECLARE @ConversationDetails_ResponseForm nvarchar(MAX)
    DECLARE @ConversationDetails_ActionableCommands nvarchar(MAX)
    DECLARE @ConversationDetails_AutomaticCommands nvarchar(MAX)
    DECLARE @ConversationDetails_OriginalMessageChanged bit
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactVersionID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ArtifactVersionID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses, @TestRunID = @ConversationDetails_TestRunID, @ResponseForm = @ConversationDetails_ResponseForm, @ActionableCommands = @ConversationDetails_ActionableCommands, @AutomaticCommands = @ConversationDetails_AutomaticCommands, @OriginalMessageChanged = @ConversationDetails_OriginalMessageChanged
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
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
    DECLARE @ConversationDetails_TestRunID uniqueidentifier
    DECLARE @ConversationDetails_ResponseForm nvarchar(MAX)
    DECLARE @ConversationDetails_ActionableCommands nvarchar(MAX)
    DECLARE @ConversationDetails_AutomaticCommands nvarchar(MAX)
    DECLARE @ConversationDetails_OriginalMessageChanged bit
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ArtifactID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses, @TestRunID = @ConversationDetails_TestRunID, @ResponseForm = @ConversationDetails_ResponseForm, @ActionableCommands = @ConversationDetails_ActionableCommands, @AutomaticCommands = @ConversationDetails_AutomaticCommands, @OriginalMessageChanged = @ConversationDetails_OriginalMessageChanged
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
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
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @AIAgentNotesID uniqueidentifier
    DECLARE @AIAgentNotes_AgentID uniqueidentifier
    DECLARE @AIAgentNotes_AgentNoteTypeID uniqueidentifier
    DECLARE @AIAgentNotes_Note nvarchar(MAX)
    DECLARE @AIAgentNotes_UserID uniqueidentifier
    DECLARE @AIAgentNotes_Type nvarchar(20)
    DECLARE @AIAgentNotes_IsAutoGenerated bit
    DECLARE @AIAgentNotes_Comments nvarchar(MAX)
    DECLARE @AIAgentNotes_Status nvarchar(20)
    DECLARE @AIAgentNotes_SourceConversationID uniqueidentifier
    DECLARE @AIAgentNotes_SourceConversationDetailID uniqueidentifier
    DECLARE @AIAgentNotes_SourceAIAgentRunID uniqueidentifier
    DECLARE @AIAgentNotes_CompanyID uniqueidentifier
    DECLARE @AIAgentNotes_EmbeddingVector nvarchar(MAX)
    DECLARE @AIAgentNotes_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_AIAgentNotes_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationID] = @ID
    
    OPEN cascade_update_AIAgentNotes_cursor
    FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @AIAgentNotes_SourceConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @AIAgentNotesID, @AgentID = @AIAgentNotes_AgentID, @AgentNoteTypeID = @AIAgentNotes_AgentNoteTypeID, @Note = @AIAgentNotes_Note, @UserID = @AIAgentNotes_UserID, @Type = @AIAgentNotes_Type, @IsAutoGenerated = @AIAgentNotes_IsAutoGenerated, @Comments = @AIAgentNotes_Comments, @Status = @AIAgentNotes_Status, @SourceConversationID = @AIAgentNotes_SourceConversationID, @SourceConversationDetailID = @AIAgentNotes_SourceConversationDetailID, @SourceAIAgentRunID = @AIAgentNotes_SourceAIAgentRunID, @CompanyID = @AIAgentNotes_CompanyID, @EmbeddingVector = @AIAgentNotes_EmbeddingVector, @EmbeddingModelID = @AIAgentNotes_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    END
    
    CLOSE cascade_update_AIAgentNotes_cursor
    DEALLOCATE cascade_update_AIAgentNotes_cursor
    
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
    
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJ_AIAgentExamplesID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_UserID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_CompanyID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_Type nvarchar(20)
    DECLARE @MJ_AIAgentExamples_ExampleInput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_ExampleOutput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_IsAutoGenerated bit
    DECLARE @MJ_AIAgentExamples_SourceConversationID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SuccessScore decimal(5, 2)
    DECLARE @MJ_AIAgentExamples_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_Status nvarchar(20)
    DECLARE @MJ_AIAgentExamples_EmbeddingVector nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentExamples_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentExamples_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentExamples_SourceConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJ_AIAgentExamplesID, @AgentID = @MJ_AIAgentExamples_AgentID, @UserID = @MJ_AIAgentExamples_UserID, @CompanyID = @MJ_AIAgentExamples_CompanyID, @Type = @MJ_AIAgentExamples_Type, @ExampleInput = @MJ_AIAgentExamples_ExampleInput, @ExampleOutput = @MJ_AIAgentExamples_ExampleOutput, @IsAutoGenerated = @MJ_AIAgentExamples_IsAutoGenerated, @SourceConversationID = @MJ_AIAgentExamples_SourceConversationID, @SourceConversationDetailID = @MJ_AIAgentExamples_SourceConversationDetailID, @SourceAIAgentRunID = @MJ_AIAgentExamples_SourceAIAgentRunID, @SuccessScore = @MJ_AIAgentExamples_SuccessScore, @Comments = @MJ_AIAgentExamples_Comments, @Status = @MJ_AIAgentExamples_Status, @EmbeddingVector = @MJ_AIAgentExamples_EmbeddingVector, @EmbeddingModelID = @MJ_AIAgentExamples_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    END
    
    CLOSE cascade_update_MJ_AIAgentExamples_cursor
    DEALLOCATE cascade_update_MJ_AIAgentExamples_cursor
    
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
    DECLARE @MJ_AIAgentRuns_TestRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID, @TestRunID = @MJ_AIAgentRuns_TestRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
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



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '134E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '124E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '134E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D04D36AE-BCB4-4DF2-8BB7-0ED3567FACF2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '64FAC701-8AB3-43C0-B741-71252122E8B0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '50D773C6-6E9F-4C00-AAE3-A284ABE38676'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0D4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '124E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '134E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '64FAC701-8AB3-43C0-B741-71252122E8B0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '50D773C6-6E9F-4C00-AAE3-A284ABE38676'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D350E5F8-8128-4A32-851E-BA6A227E4D5C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6C6CC59F-D153-47DB-A664-3C9884B07059'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 34 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0C4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '124E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '134E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Hidden To User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Summary Of Earlier Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '21B640E1-D21E-4E4B-95BC-E9862FD11C8A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completion Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '55E7C54B-74F7-4E25-BF60-A79C28AD2410'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Pinned',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D04D36AE-BCB4-4DF2-8BB7-0ED3567FACF2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '64FAC701-8AB3-43C0-B741-71252122E8B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Suggested Responses',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79639F85-7B4A-4ACA-89B3-3D043D0AE9FB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Message Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Original Message Changed',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F99F9670-A9A8-44BE-8F4F-1C3138490591'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'External ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '695817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6A5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B4BAC05B-4345-49B2-97B2-FB761777078D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4F2FE5B3-6AD4-485C-AEBA-F7060064E62C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Feedback & Insights',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Rating',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ACAB0610-A4EA-433B-A39A-C2D6EFB46F59'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Feedback & Insights',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Feedback',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C400A5F2-1BE3-4441-AEFA-06344A12AAB2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Feedback & Insights',
       GeneratedFormSection = 'Category',
       DisplayName = 'Reflection Insights',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E69363F6-164F-41B8-B521-889B56493CE9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '68EA370B-0AB9-45AF-A1EC-88A94329A3A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9AB7E01-35D5-4FDB-8C61-24292B0F0A19'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ABF64F53-7927-4039-B5B8-DC07E8435B36'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '14488A57-7BC6-455F-88DF-2264585DA63F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8BE14CF2-2F23-4208-8313-91259D312DB2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '50D773C6-6E9F-4C00-AAE3-A284ABE38676'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D350E5F8-8128-4A32-851E-BA6A227E4D5C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D510523A-90B9-4797-B1B9-83B5C16AC117'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B4B63C2-91A7-4B53-ABAC-E15AA9600FEB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C6CC59F-D153-47DB-A664-3C9884B07059'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interactive Elements',
       GeneratedFormSection = 'Category',
       DisplayName = 'Response Form',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '811099AE-EFF5-4BAE-BFD1-66F68F95C36E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interactive Elements',
       GeneratedFormSection = 'Category',
       DisplayName = 'Actionable Commands',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2433C81E-0921-404B-969F-7A37DBF23D4A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interactive Elements',
       GeneratedFormSection = 'Category',
       DisplayName = 'Automatic Commands',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5D185550-A536-43BD-8A45-1324F35B7BA1'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('da3f8312-df4c-4c96-85b7-bc1ec5fcba0e', '12248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Message Core":{"icon":"fa fa-comment","description":""},"User Feedback & Insights":{"icon":"fa fa-star","description":""},"System Metadata":{"icon":"fa fa-cog","description":""},"Related Entities":{"icon":"fa fa-sitemap","description":""},"Interactive Elements":{"icon":"fa fa-hand-pointer","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Message Core":"fa fa-comment","User Feedback & Insights":"fa fa-star","System Metadata":"fa fa-cog","Related Entities":"fa fa-sitemap","Interactive Elements":"fa fa-hand-pointer"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'

/* Sync EntityField sequences with actual database column order */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'
            

