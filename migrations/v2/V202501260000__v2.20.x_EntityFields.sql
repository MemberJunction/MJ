
/* SQL text to insert new entity field */
MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '1c2e756d-4457-495d-b7bf-43402a1e4e4e' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'Integration')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('1c2e756d-4457-495d-b7bf-43402a1e4e4e', 'E5238F34-2837-EF11-86D4-6045BDEE16E6', 13, 'Integration', 'Integration', NULL, 'nvarchar', 200, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');


/* SQL text to insert new entity field */

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '2c8d1ad8-7743-46c2-9b40-a7c6c9f0765b' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'Company')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('2c8d1ad8-7743-46c2-9b40-a7c6c9f0765b', 'E5238F34-2837-EF11-86D4-6045BDEE16E6', 14, 'Company', 'Company', NULL, 'nvarchar', 100, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '61670b7f-b013-4194-b529-753d117f8ce2' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'EF238F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'Status')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('61670b7f-b013-4194-b529-753d117f8ce2', 'EF238F34-2837-EF11-86D4-6045BDEE16E6', 7, 'Status', 'Status', 'Tracks the status of each individual list detail row to enable processing of various types and the use of the status column for filtering list detail rows within a list that are in a particular state.', 'nvarchar', 60, 0, 0, 0, 'Pending', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');


MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '7effbdb7-e5ac-4431-a5e4-d9fa6988f9f7' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'EF238F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'AdditionalData')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('7effbdb7-e5ac-4431-a5e4-d9fa6988f9f7', 'EF238F34-2837-EF11-86D4-6045BDEE16E6', 8, 'AdditionalData', 'Additional Data', 'Optional column that allows for tracking any additional data for each ListDetail row', 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '5b8e8ca9-7728-455a-a528-0f13782242c0' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'SpeedRank')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('5b8e8ca9-7728-455a-a528-0f13782242c0', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 13, 'SpeedRank', 'Speed Rank', 'Optional column that ranks the speed of the AI model. Default is 0 and should be non-negative.', 'int', 4, 10, 0, 1, '(0)', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '2ed7be95-4e39-439b-8152-d0a6516c1398' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'CostRank')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('2ed7be95-4e39-439b-8152-d0a6516c1398', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 14, 'CostRank', 'Cost Rank', 'Optional column that ranks the cost of the AI model. Default is 0 and should be non-negative.', 'int', 4, 10, 0, 1, '(0)', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '309321b0-2443-47a1-85e6-a134664b4aab' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'ModelSelectionInsights')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('309321b0-2443-47a1-85e6-a134664b4aab', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 15, 'ModelSelectionInsights', 'Model Selection Insights', 'This column stores unstructured text notes that provide insights into what the model is particularly good at and areas where it may not perform as well. These notes can be used by a human or an AI to determine if the model is a good fit for various purposes.', 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '5ec9d425-b9da-4fed-acc9-596859658679' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'InputTokenLimit')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('5ec9d425-b9da-4fed-acc9-596859658679', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 16, 'InputTokenLimit', 'Input Token Limit', 'Stores the maximum number of tokens that fit in the context window for the model.', 'int', 4, 10, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT 'f7d341aa-6377-43b0-a37b-33a40bca44d4' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '11248F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'Columns')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('f7d341aa-6377-43b0-a37b-33a40bca44d4', '11248F34-2837-EF11-86D4-6045BDEE16E6', 11, 'Columns', 'Columns', 'Optional column to store a comma-delimited list of columns for the DatasetItem', 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT 'acab0610-a4ea-433b-a39a-c2d6efb46f59' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'UserRating')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('acab0610-a4ea-433b-a39a-c2d6efb46f59', '12248F34-2837-EF11-86D4-6045BDEE16E6', 10, 'UserRating', 'User Rating', 'This column is used to capture user feedback as a rating scale. The scale ranges from 1 to 10, where 1 might represent thumbs down, and 10 might represent thumbs up or the highest rating in a star-based scale.', 'int', 4, 10, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT 'c400a5f2-1be3-4441-aefa-06344a12aab2' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'UserFeedback')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('c400a5f2-1be3-4441-aefa-06344a12aab2', '12248F34-2837-EF11-86D4-6045BDEE16E6', 11, 'UserFeedback', 'User Feedback', 'This column is used to store user text feedback about a given AI response, describing what they liked or disliked.', 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT 'e69363f6-164f-41b8-b521-889b56493ce9' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'ReflectionInsights')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('e69363f6-164f-41b8-b521-889b56493ce9', '12248F34-2837-EF11-86D4-6045BDEE16E6', 12, 'ReflectionInsights', 'Reflection Insights', 'This column stores human or AI-generated reflections on how to improve future responses based on the user feedback and the AI output generated for prior messages in the conversation.', 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '21b640e1-d21e-4e4b-95bc-e9862fd11c8a' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'SummaryOfEarlierConversation')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('21b640e1-d21e-4e4b-95bc-e9862fd11c8a', '12248F34-2837-EF11-86D4-6045BDEE16E6', 13, 'SummaryOfEarlierConversation', 'Summary Of Earlier Conversation', 'This column optionally stores a summary of the entire conversation leading up to this particular conversation detail record. It is used in long-running conversations to optimize performance by summarizing earlier parts.', 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '62e7e3da-d9a7-42b6-8316-84aa7e66c469' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'SupportsScheduledSending')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('62e7e3da-d9a7-42b6-8316-84aa7e66c469', '43248F34-2837-EF11-86D4-6045BDEE16E6', 9, 'SupportsScheduledSending', 'Supports Scheduled Sending', 'Whether or not the provider supports sending messages at a specific time', 'bit', 1, 1, 0, 0, '(0)', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Dropdown');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '7321b323-7f8b-4dcd-ae44-01fce8aab7ef' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '4B248F34-2837-EF11-86D4-6045BDEE16E6' AND Target.Name = 'OrderBy')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('7321b323-7f8b-4dcd-ae44-01fce8aab7ef', '4B248F34-2837-EF11-86D4-6045BDEE16E6', 15, 'OrderBy', 'Order By', 'This field is used only when the Type of the TemplateParam table is "Entity". It is an optional field used to specify the sorting order for the related entity data that is used in the template for the Entity specified.', 'nvarchar', -1, 0, 0, 1, 'null', 0, 1, 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '99eb5364-1b2b-430b-bc94-709c6d26aa08' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '201852E1-4587-EF11-8473-6045BDF077EE' AND Target.Name = 'ResourceType')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('99eb5364-1b2b-430b-bc94-709c6d26aa08', '201852E1-4587-EF11-8473-6045BDF077EE', 13, 'ResourceType', 'Resource Type', NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT 'ea65a64e-9935-4702-aedd-a2a4bdc1bcd2' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '201852E1-4587-EF11-8473-6045BDF077EE' AND Target.Name = 'Role')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('ea65a64e-9935-4702-aedd-a2a4bdc1bcd2', '201852E1-4587-EF11-8473-6045BDF077EE', 14, 'Role', 'Role', NULL, 'nvarchar', 100, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '1a164f09-d65d-4b1f-b954-f1a2201427f0' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '201852E1-4587-EF11-8473-6045BDF077EE' AND Target.Name = 'User')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('1a164f09-d65d-4b1f-b954-f1a2201427f0', '201852E1-4587-EF11-8473-6045BDF077EE', 15, 'User', 'User', NULL, 'nvarchar', 200, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '4b012aeb-14bf-4ad2-99cf-df6732f55d70' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Target.Name = 'Source')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('4b012aeb-14bf-4ad2-99cf-df6732f55d70', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 9, 'Source', 'Source', NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '91a88b6d-ec50-4d86-ab4f-e637264e706f' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND Target.Name = 'ContentSource')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('91a88b6d-ec50-4d86-ab4f-e637264e706f', 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 7, 'ContentSource', 'Content Source', NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT 'addf8ac9-bf3a-4ecb-af21-5c04da27c396' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Target.Name = 'AIModel')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('addf8ac9-bf3a-4ecb-af21-5c04da27c396', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 9, 'AIModel', 'AIModel', NULL, 'nvarchar', 100, 0, 0, 0, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT 'c1b90859-5c3a-46cc-8b10-cf89f97ee38b' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22' AND Target.Name = 'ContentItem')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('c1b90859-5c3a-46cc-8b10-cf89f97ee38b', 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22', 7, 'ContentItem', 'Content Item', NULL, 'nvarchar', 500, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');

MERGE INTO [${flyway:defaultSchema}].EntityField AS Target
USING (SELECT '8d73962b-3d7d-489e-837f-732c90578325' AS ID) AS Source
ON Target.ID = Source.ID
   OR (Target.EntityID = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND Target.Name = 'Item')
WHEN NOT MATCHED THEN
INSERT (ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType) VALUES('8d73962b-3d7d-489e-837f-732c90578325', 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 6, 'Item', 'Item', NULL, 'nvarchar', 500, 0, 0, 1, 'null', 0, 0, 1, NULL, NULL, 0, 0, 0, 0, 0, 0, 'Search');


/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'
