-- Step 1: Drop the ResourceRecordID column
ALTER TABLE ${flyway:defaultSchema}.UserNotification
DROP COLUMN ResourceRecordID;
GO

-- Step 2: Add the ResourceRecordID column with the new data type
ALTER TABLE ${flyway:defaultSchema}.UserNotification
ADD ResourceRecordID uniqueidentifier NULL;
GO

UPDATE ${flyway:defaultSchema}.EntityField SET IncludeRelatedEntityNameFieldInBaseView = 1
WHERE
  EntityID IN (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE SchemaName='${flyway:defaultSchema}')
  AND IncludeRelatedEntityNameFieldInBaseView = 0 AND RelatedEntityID IS NOT NULL
