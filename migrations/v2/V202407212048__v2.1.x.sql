/*
 **************************************************************************************************************
  Communication_Metadata Dataset
 **************************************************************************************************************
*/

INSERT INTO ${flyway:defaultSchema}.Dataset ( ID, Name, Description )
VALUES ( 'e037040b-758b-4e11-820a-d501422a4c8e', 'Communication_Metadata', 'Metadata cached for the Communication Framework' )

INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'BaseMessageTypes', 'e037040b-758b-4e11-820a-d501422a4c8e', 1, '47248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'Providers', 'e037040b-758b-4e11-820a-d501422a4c8e', 2, '43248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'ProviderMessageTypes', 'e037040b-758b-4e11-820a-d501422a4c8e', 3, '45248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'EntityCommunicationMessageTypes', 'e037040b-758b-4e11-820a-d501422a4c8e', 4, '51248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'EntityCommunicationFields', 'e037040b-758b-4e11-820a-d501422a4c8e', 5, '52248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')



/*
 **************************************************************************************************************
  Template_Metadata Dataset
 **************************************************************************************************************
*/
DECLARE @Template_Metadata TABLE (ID uniqueidentifier);

INSERT INTO ${flyway:defaultSchema}.Dataset ( ID, Name, Description )
VALUES ( 'b17bf510-e069-4c7f-ae7c-eceff6feb9b2', 'Template_Metadata', 'Metadata cached for the Templates Framework' )

INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'TemplateContentTypes', 'b17bf510-e069-4c7f-ae7c-eceff6feb9b2', 1, '4C248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'TemplateCategories', 'b17bf510-e069-4c7f-ae7c-eceff6feb9b2', 2, '49248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'Templates', 'b17bf510-e069-4c7f-ae7c-eceff6feb9b2', 3, '48248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'TemplateContents', 'b17bf510-e069-4c7f-ae7c-eceff6feb9b2', 4, '4A248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO ${flyway:defaultSchema}.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'TemplateParams', 'b17bf510-e069-4c7f-ae7c-eceff6feb9b2', 5, '4B248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')
