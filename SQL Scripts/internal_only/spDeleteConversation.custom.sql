-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spDeleteConversation
-- Generated: 7/13/2023, 9:11:12 PM
--
-- This was generated by the Entity Generator.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('dbo.spDeleteConversation', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spDeleteConversation]
GO

CREATE PROCEDURE [dbo].[spDeleteConversation]
    @ID INT
AS  
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Report - set FK to null before deleting rows in Conversation
    UPDATE 
        [admin].[Report] 
    SET 
        [ConversationID] = NULL 
    WHERE 
        [ConversationID] = @ID

	UPDATE 
        [admin].[Report] 
    SET 
        [ConversationDetailID] = NULL 
    WHERE 
        [ConversationDetailID] IN (SELECT ID FROM admin.ConversationDetail WHERE ConversationID = @ID)

    
    -- Cascade delete from ConversationDetail
    DELETE FROM 
        [admin].[ConversationDetail] 
    WHERE 
        [ConversationID] = @ID
    
    DELETE FROM 
        [admin].[Conversation]
    WHERE 
        [ID] = @ID
    SELECT @ID AS ID -- Return the ID to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [spDeleteConversation] TO [cdp_UI]
