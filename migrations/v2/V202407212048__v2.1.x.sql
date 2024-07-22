/*
 **************************************************************************************************************
  Communication_Metadata Dataset
 **************************************************************************************************************
*/
DECLARE @Communication_Metadata TABLE (ID uniqueidentifier);

INSERT INTO __mj.Dataset ( Name, Description )
OUTPUT inserted.ID INTO @Communication_Metadata
VALUES ( 'Communication_Metadata', 'Metadata cached for the Communication Framework' )

DECLARE @Communication_MetadataID uniqueidentifier;
SELECT @Communication_MetadataID = ID FROM @Communication_Metadata;

INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'BaseMessageTypes', @Communication_MetadataID, 1, '47248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'Providers', @Communication_MetadataID, 2, '43248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'ProviderMessageTypes', @Communication_MetadataID, 3, '45248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'EntityCommunicationMessageTypes', @Communication_MetadataID, 4, '51248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'EntityCommunicationFields', @Communication_MetadataID, 5, '52248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')



/*
 **************************************************************************************************************
  Template_Metadata Dataset
 **************************************************************************************************************
*/
DECLARE @Template_Metadata TABLE (ID uniqueidentifier);

INSERT INTO __mj.Dataset ( Name, Description )
OUTPUT inserted.ID INTO @Template_Metadata
VALUES ( 'Template_Metadata', 'Metadata cached for the Templates Framework' )

DECLARE @Template_MetadataID uniqueidentifier;
SELECT @Template_MetadataID = ID FROM @Template_Metadata;


INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'TemplateContentTypes', @Template_MetadataID, 1, '4C248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'TemplateCategories', @Template_MetadataID, 2, '49248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'Templates', @Template_MetadataID, 3, '48248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'TemplateContents', @Template_MetadataID, 4, '4A248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')


INSERT INTO __mj.DatasetItem
( Code, DatasetID, Sequence, EntityID, DateFieldToCheck )
VALUES
( 'TemplateParams', @Template_MetadataID, 5, '4B248F34-2837-EF11-86D4-6045BDEE16E6', '__mj_UpdatedAt')
