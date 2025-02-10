DROP PROC IF EXISTS __mj.spDeleteEntity_BeCareful
GO
CREATE PROCEDURE __mj.spDeleteEntity_BeCareful (
   @EntityName NVARCHAR(200)
)
AS
BEGIN
DECLARE @EntityID UNIQUEIDENTIFIER;
SELECT @EntityID=ID FROM __mj.Entity WHERE Name=@EntityName;

DELETE FROM __mj.ApplicationEntity WHERE EntityID=@EntityID;
DELETE FROM __mj.EntityRelationship WHERE RelatedEntityID = @EntityID OR EntityID = @EntityID;
DELETE FROM __mj.EntityFieldValue WHERE EntityFieldID IN ( SELECT ID FROM __mj.EntityField WHERE EntityID=@EntityID);
DELETE FROM __mj.EntityPermission WHERE EntityID = @EntityID;
DELETE FROM __mj.EntityField WHERE EntityID = @EntityID;
DELETE FROM __mj.Entity WHERE ID = @EntityID;
END
GO
