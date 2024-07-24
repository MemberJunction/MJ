-- Step 1: Drop the ResourceRecordID column
ALTER TABLE __mj.UserNotification
DROP COLUMN ResourceRecordID;
GO

-- Step 2: Add the ResourceRecordID column with the new data type
ALTER TABLE __mj.UserNotification
ADD ResourceRecordID uniqueidentifier NULL;
GO

UPDATE __mj.EntityField SET IncludeRelatedEntityNameFieldInBaseView = 1
WHERE
  EntityID IN (SELECT ID FROM __mj.Entity WHERE SchemaName='__mj')
  AND IncludeRelatedEntityNameFieldInBaseView = 0 AND RelatedEntityID IS NOT NULL
