/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue (EntityFieldID, Sequence, Value, Code) VALUES ('61670B7F-B013-4194-B529-753D117F8CE2', 1, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue (EntityFieldID, Sequence, Value, Code) VALUES ('61670B7F-B013-4194-B529-753D117F8CE2', 2, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue (EntityFieldID, Sequence, Value, Code) VALUES ('61670B7F-B013-4194-B529-753D117F8CE2', 3, 'Disabled', 'Disabled')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue (EntityFieldID, Sequence, Value, Code) VALUES ('61670B7F-B013-4194-B529-753D117F8CE2', 4, 'Rejected', 'Rejected')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue (EntityFieldID, Sequence, Value, Code) VALUES ('61670B7F-B013-4194-B529-753D117F8CE2', 5, 'Complete', 'Complete')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue (EntityFieldID, Sequence, Value, Code) VALUES ('61670B7F-B013-4194-B529-753D117F8CE2', 6, 'Error', 'Error')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue (EntityFieldID, Sequence, Value, Code) VALUES ('61670B7F-B013-4194-B529-753D117F8CE2', 7, 'Other', 'Other')

/* SQL text to update ValueListType for entity field ID 61670B7F-B013-4194-B529-753D117F8CE2 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='61670B7F-B013-4194-B529-753D117F8CE2'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to create Entitiy Relationships */
MERGE INTO [${flyway:defaultSchema}].EntityRelationship AS Target
USING (SELECT '09541d11-8e3f-4586-9154-b15be835d463' AS ID) AS Source
ON Target.ID = Source.ID
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('09541d11-8e3f-4586-9154-b15be835d463', '7DAD0238-8B56-EF11-991A-6045BDEBA539', '7DAD0238-8B56-EF11-991A-6045BDEBA539', 'ParentID', 'One To Many', 1, 1, 'AI Prompt Categories', 2);

/* SQL text to create Entitiy Relationships */
MERGE INTO [${flyway:defaultSchema}].EntityRelationship AS Target
USING (SELECT 'bef6f2c7-8f9c-4e60-95f6-42bde2beb0c3' AS ID) AS Source
ON Target.ID = Source.ID
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('bef6f2c7-8f9c-4e60-95f6-42bde2beb0c3', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '78AD0238-8B56-EF11-991A-6045BDEBA539', 'AIModelID', 'One To Many', 1, 1, 'AI Result Cache', 1);

MERGE INTO [${flyway:defaultSchema}].EntityRelationship AS Target
USING (SELECT 'f7324545-fca7-4aca-9596-02673ca81e7b' AS ID) AS Source
ON Target.ID = Source.ID
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence) VALUES ('f7324545-fca7-4aca-9596-02673ca81e7b', '48248F34-2837-EF11-86D4-6045BDEE16E6', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'TemplateID', 'One To Many', 1, 1, 'AI Prompts', 2);

/* SQL text to update entity field related entity name field map for entity field ID 3DDE5E8E-A83B-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3DDE5E8E-A83B-EF11-86D4-0022481D1B23', @RelatedEntityNameFieldMap='CreatedByUser'

/* SQL text to update entity field related entity name field map for entity field ID 250644A9-0A3C-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='250644A9-0A3C-EF11-86D4-0022481D1B23', @RelatedEntityNameFieldMap='ScheduledAction'

/* SQL text to update entity field related entity name field map for entity field ID 260644A9-0A3C-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='260644A9-0A3C-EF11-86D4-0022481D1B23', @RelatedEntityNameFieldMap='ActionParam'

/* SQL text to update entity field related entity name field map for entity field ID 3EDE5E8E-A83B-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3EDE5E8E-A83B-EF11-86D4-0022481D1B23', @RelatedEntityNameFieldMap='Action'

/* SQL text to update entity field related entity name field map for entity field ID AE4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AE4C17F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='Category'

/* SQL text to update entity field related entity name field map for entity field ID 017B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='017B842E-AA38-EF11-86D4-000D3A4E707E', @RelatedEntityNameFieldMap='AuditLogType'

/* SQL text to update entity field related entity name field map for entity field ID 027B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='027B842E-AA38-EF11-86D4-000D3A4E707E', @RelatedEntityNameFieldMap='Authorization'

/* SQL text to update entity field related entity name field map for entity field ID 037B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='037B842E-AA38-EF11-86D4-000D3A4E707E', @RelatedEntityNameFieldMap='Authorization'

/* SQL text to update entity field related entity name field map for entity field ID 057B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='057B842E-AA38-EF11-86D4-000D3A4E707E', @RelatedEntityNameFieldMap='Authorization'

/* SQL text to update entity field related entity name field map for entity field ID 047B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='047B842E-AA38-EF11-86D4-000D3A4E707E', @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID C88C8778-B939-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C88C8778-B939-EF11-86D4-000D3A4E707E', @RelatedEntityNameFieldMap='Dataset'

/* SQL text to update entity field related entity name field map for entity field ID EB4E17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EB4E17F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='DataContext'

/* SQL text to update entity field related entity name field map for entity field ID 534317F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='534317F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='ApprovedByUser'

/* SQL text to update entity field related entity name field map for entity field ID 7C4E17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7C4E17F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='Query'

/* SQL text to update entity field related entity name field map for entity field ID 167B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='167B842E-AA38-EF11-86D4-000D3A4E707E', @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID EC4317F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EC4317F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID 294F17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='294F17F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='EntityDocument'

/* SQL text to update entity field related entity name field map for entity field ID EF4317F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EF4317F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='VectorIndex'

/* SQL text to update entity field related entity name field map for entity field ID 2A4F17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2A4F17F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='VectorDatabase'

/* SQL text to update entity field related entity name field map for entity field ID 114F17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='114F17F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID B0EB26E0-3E3B-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B0EB26E0-3E3B-EF11-86D4-0022481D1B23', @RelatedEntityNameFieldMap='Template'

/* SQL text to update entity field related entity name field map for entity field ID 2B4F17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2B4F17F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID C98C8778-B939-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C98C8778-B939-EF11-86D4-000D3A4E707E', @RelatedEntityNameFieldMap='Application'

/* SQL text to update entity field related entity name field map for entity field ID 237B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='237B842E-AA38-EF11-86D4-000D3A4E707E', @RelatedEntityNameFieldMap='Authorization'

/* SQL text to update entity field related entity name field map for entity field ID AC4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AC4C17F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='Parent'

/* SQL text to update entity field related entity name field map for entity field ID AD4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AD4C17F0-6F36-EF11-86D4-6045BDEE16E6', @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID E0C3FD0E-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E0C3FD0E-8FA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID BE6DCA20-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BE6DCA20-8FA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID E4C3FD0E-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E4C3FD0E-8FA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID BF6DCA20-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BF6DCA20-8FA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID E5C3FD0E-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E5C3FD0E-8FA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 2A072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2A072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 33072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='33072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 34072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='34072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 35072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='35072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 3A072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3A072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 4F072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4F072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 61072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='61072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 6D072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6D072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 73072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='73072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 64072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='64072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 65072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='65072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 66072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='66072FEB-8EA7-EF11-AFEF-286B35C04427', @RelatedEntityNameFieldMap='ContentFileType'

