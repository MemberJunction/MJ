-- 2.37.x Migration to add new columns

-- Add ArtifactID and ArtifactVersionID columns to the ${flyway:defaultSchema}.ConversationDetail table
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
ADD 
    [ArtifactID] [uniqueidentifier] NULL,
    [ArtifactVersionID] [uniqueidentifier] NULL;

-- Add foreign key constraints for the new columns
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
ADD CONSTRAINT [FK_ConversationDetail_ConversationArtifact] 
    FOREIGN KEY ([ArtifactID]) 
    REFERENCES [${flyway:defaultSchema}].[ConversationArtifact] ([ID]);

ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
ADD CONSTRAINT [FK_ConversationDetail_ConversationArtifactVersion] 
    FOREIGN KEY ([ArtifactVersionID]) 
    REFERENCES [${flyway:defaultSchema}].[ConversationArtifactVersion] ([ID]);

-- Add column documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a conversation artifact associated with this conversation detail',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationDetail',
    @level2type = N'COLUMN', @level2name = N'ArtifactID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a specific version of a conversation artifact associated with this conversation detail',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationDetail',
    @level2type = N'COLUMN', @level2name = N'ArtifactVersionID';


/** CODE GEN OUTPUT **/
/** CODE GEN OUTPUT **/
/** CODE GEN OUTPUT **/
/** CODE GEN OUTPUT **/
/** CODE GEN OUTPUT **/
/** CODE GEN OUTPUT **/
/** CODE GEN OUTPUT **/

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e9ab7e01-35d5-4fdb-8c61-24292b0f0a19'  OR 
               (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ArtifactID')
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
            'e9ab7e01-35d5-4fdb-8c61-24292b0f0a19',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversation Details
            15,
            'ArtifactID',
            'Artifact ID',
            'Optional reference to a conversation artifact associated with this conversation detail',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '355ECE47-BC5B-45D7-8B52-967446517137',
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
         WHERE ID = 'abf64f53-7927-4039-b5b8-dc07e8435b36'  OR 
               (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ArtifactVersionID')
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
            'abf64f53-7927-4039-b5b8-dc07e8435b36',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversation Details
            16,
            'ArtifactVersionID',
            'Artifact Version ID',
            'Optional reference to a specific version of a conversation artifact associated with this conversation detail',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'B51CF0E1-2A79-407E-B716-610A608BADAE',
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
      WHERE ID = 'dc19a1a4-931c-40f3-871a-9a7240e1e4ff'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('dc19a1a4-931c-40f3-871a-9a7240e1e4ff', 'B51CF0E1-2A79-407E-B716-610A608BADAE', '12248F34-2837-EF11-86D4-6045BDEE16E6', 'ArtifactVersionID', 'One To Many', 1, 1, 'Conversation Details', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '478c56c8-88d1-44b5-b7b7-25ab8c582fb4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('478c56c8-88d1-44b5-b7b7-25ab8c582fb4', '355ECE47-BC5B-45D7-8B52-967446517137', '12248F34-2837-EF11-86D4-6045BDEE16E6', 'ArtifactID', 'One To Many', 1, 1, 'Conversation Details', 3);
   END
                              

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

/* SQL text to update entity field related entity name field map for entity field ID E9AB7E01-35D5-4FDB-8C61-24292B0F0A19 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E9AB7E01-35D5-4FDB-8C61-24292B0F0A19',
         @RelatedEntityNameFieldMap='Artifact'

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
    @ArtifactVersionID uniqueidentifier
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
            [ArtifactVersionID]
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
            @ArtifactVersionID
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
    @ArtifactVersionID uniqueidentifier
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
        [ArtifactVersionID] = @ArtifactVersionID
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
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ConversationDetail table
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
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd350e5f8-8128-4a32-851e-ba6a227e4d5c'  OR 
               (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Artifact')
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
            'd350e5f8-8128-4a32-851e-ba6a227e4d5c',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversation Details
            19,
            'Artifact',
            'Artifact',
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

