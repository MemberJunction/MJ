DROP PROC IF EXISTS ${flyway:defaultSchema}.spDeleteEntityWithCoreDependencies
GO
CREATE PROC ${flyway:defaultSchema}.spDeleteEntityWithCoreDependencies
  @EntityID uniqueidentifier
AS
DELETE FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID IN (SELECT ID FROM ${flyway:defaultSchema}.EntityField WHERE EntityID = @EntityID)
DELETE FROM ${flyway:defaultSchema}.EntitySetting WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.EntityField WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.EntityPermission WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.EntityRelationship WHERE EntityID = @EntityID OR RelatedEntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.UserApplicationEntity WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.ApplicationEntity WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.RecordChange WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.AuditLog WHERE EntityID=@EntityID
DELETE FROM ${flyway:defaultSchema}.[Conversation] WHERE LinkedEntityID=@EntityID
DELETE FROM ${flyway:defaultSchema}.ListDetail WHERE ListID IN (SELECT ID FROM ${flyway:defaultSchema}.List WHERE EntityID=@EntityID)
DELETE FROM ${flyway:defaultSchema}.List WHERE EntityID=@EntityID

DELETE FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRecordMap] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[UserApplicationEntity] WHERE [EntityID] = @EntityID;

UPDATE ${flyway:defaultSchema}.Dataset SET ${flyway:defaultSchema}_UpdatedAt=GETUTCDATE() WHERE ID IN (SELECT DatasetID FROM ${flyway:defaultSchema}.DatasetItem WHERE EntityID=@EntityID)
DELETE FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID;

DELETE FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;

DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [OutputEntityID] = @EntityID;

DELETE FROM ${flyway:defaultSchema}.Entity WHERE ID = @EntityID
GO
