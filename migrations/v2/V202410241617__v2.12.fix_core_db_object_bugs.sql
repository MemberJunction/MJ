DROP PROC IF EXISTS ${flyway:defaultSchema}.spDeleteEntityWithCoreDependencies
GO
CREATE PROC ${flyway:defaultSchema}.spDeleteEntityWithCoreDependencies
  @EntityID nvarchar(100)
AS
DELETE FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID IN (SELECT ID FROM ${flyway:defaultSchema}.EntityField WHERE EntityID = @EntityID)
DELETE FROM ${flyway:defaultSchema}.EntityField WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.EntityPermission WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.EntityRelationship WHERE EntityID = @EntityID OR RelatedEntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.UserApplicationEntity WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.ApplicationEntity WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.RecordChange WHERE EntityID = @EntityID
DELETE FROM ${flyway:defaultSchema}.Entity WHERE ID = @EntityID
GO
