-- Fix spDeleteConversation SP to do multi-layer cascade delete
ALTER PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Report - set FK to null before deleting rows in Conversation
    UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        [ConversationID] = NULL
    WHERE
        [ConversationID] = @ID

	UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        [ConversationDetailID] = NULL
    WHERE
        [ConversationDetailID] IN (SELECT ID FROM ${flyway:defaultSchema}.ConversationDetail WHERE ConversationID = @ID)

    -- Cascade delete from ArtifactVersion
    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    WHERE
        [ConversationArtifactID] IN (SELECT ID FROM ${flyway:defaultSchema}.ConversationArtifact WHERE ConversationID = @ID)

    -- Cascade delete from ConversationArtifactPermission
	DELETE FROM
		${flyway:defaultSchema}.ConversationArtifactPermission
    WHERE
        [ConversationArtifactID] IN (SELECT ID FROM ${flyway:defaultSchema}.ConversationArtifact WHERE ConversationID = @ID)

    -- Cascade delete from ConversationArtifact
	DELETE FROM
		${flyway:defaultSchema}.ConversationArtifact
	WHERE
		ConversationID = @ID

    -- Cascade delete from ConversationDetail
    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ConversationID] = @ID

    DELETE FROM
        [${flyway:defaultSchema}].[Conversation]
    WHERE
        [ID] = @ID
    SELECT @ID AS ID -- Return the ID to indicate we successfully deleted the record
END
