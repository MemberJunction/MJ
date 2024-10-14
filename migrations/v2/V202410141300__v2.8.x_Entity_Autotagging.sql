 /****************************************************************************************
Insert new values into Content Autotagging tables
****************************************************************************************/
INSERT INTO [${flyway:defaultSchema}].ContentFileType ( ID, Name, FileExtension ) VALUES ( '31622104-D887-EF11-8473-6045BDF05BB3', 'Other', NULL )
INSERT INTO [${flyway:defaultSchema}].ContentSourceType ( ID, Name, Description ) VALUES ( 'B0909B91-6487-EF11-8473-6045BDF05BB3', 'Entity', NULL )
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (ID, Name, Description, Type, DefaultValue, IsRequired ) VALUES ('4545AA90-D787-EF11-8473-6045BDF05BB3', 'EntityName', 'The name of the entity to tag', 'string', '', 1)
INSERT INTO [${flyway:defaultSchema}].ContentSourceTypeParam (ID, Name, Description, Type, DefaultValue, IsRequired ) VALUES ('C6D786A5-D787-EF11-8473-6045BDF05BB3', 'EntityFields', 'The specific fields of an entity that we want to tag', 'string[]', '[]', 1)
