
/* SQL text to insert new entity field */
IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '1c2e756d-4457-495d-b7bf-43402a1e4e4e'
       OR (EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Integration')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '1c2e756d-4457-495d-b7bf-43402a1e4e4e',
         'E5238F34-2837-EF11-86D4-6045BDEE16E6',
         13,
         'Integration',
         'Integration',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END


/* SQL text to insert new entity field */

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '2c8d1ad8-7743-46c2-9b40-a7c6c9f0765b'
       OR (EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Company')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '2c8d1ad8-7743-46c2-9b40-a7c6c9f0765b',
         'E5238F34-2837-EF11-86D4-6045BDEE16E6',
         14,
         'Company',
         'Company',
         NULL,
         'nvarchar',
         100,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '61670b7f-b013-4194-b529-753d117f8ce2'
       OR (EntityID = 'EF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Status')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '61670b7f-b013-4194-b529-753d117f8ce2',
         'EF238F34-2837-EF11-86D4-6045BDEE16E6',
         7,
         'Status',
         'Status',
         'Tracks the status of each individual list detail row to enable processing of various types and the use of the status column for filtering list detail rows within a list that are in a particular state.',
         'nvarchar',
         60,
         0,
         0,
         0,
         'Pending',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END


IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '7effbdb7-e5ac-4431-a5e4-d9fa6988f9f7'
       OR (EntityID = 'EF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AdditionalData')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '7effbdb7-e5ac-4431-a5e4-d9fa6988f9f7',
         'EF238F34-2837-EF11-86D4-6045BDEE16E6',
         8,
         'AdditionalData',
         'Additional Data',
         'Optional column that allows for tracking any additional data for each ListDetail row',
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '5b8e8ca9-7728-455a-a528-0f13782242c0'
       OR (EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SpeedRank')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '5b8e8ca9-7728-455a-a528-0f13782242c0',
         'FD238F34-2837-EF11-86D4-6045BDEE16E6',
         13,
         'SpeedRank',
         'Speed Rank',
         'Optional column that ranks the speed of the AI model. Default is 0 and should be non-negative.',
         'int',
         4,
         10,
         0,
         1,
         '(0)',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '2ed7be95-4e39-439b-8152-d0a6516c1398'
       OR (EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CostRank')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '2ed7be95-4e39-439b-8152-d0a6516c1398',
         'FD238F34-2837-EF11-86D4-6045BDEE16E6',
         14,
         'CostRank',
         'Cost Rank',
         'Optional column that ranks the cost of the AI model. Default is 0 and should be non-negative.',
         'int',
         4,
         10,
         0,
         1,
         '(0)',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '309321b0-2443-47a1-85e6-a134664b4aab'
       OR (EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ModelSelectionInsights')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '309321b0-2443-47a1-85e6-a134664b4aab',
         'FD238F34-2837-EF11-86D4-6045BDEE16E6',
         15,
         'ModelSelectionInsights',
         'Model Selection Insights',
         'This column stores unstructured text notes that provide insights into what the model is particularly good at and areas where it may not perform as well. These notes can be used by a human or an AI to determine if the model is a good fit for various purposes.',
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '5ec9d425-b9da-4fed-acc9-596859658679'
       OR (EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'InputTokenLimit')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '5ec9d425-b9da-4fed-acc9-596859658679',
         'FD238F34-2837-EF11-86D4-6045BDEE16E6',
         16,
         'InputTokenLimit',
         'Input Token Limit',
         'Stores the maximum number of tokens that fit in the context window for the model.',
         'int',
         4,
         10,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'f7d341aa-6377-43b0-a37b-33a40bca44d4'
       OR (EntityID = '11248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Columns')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'f7d341aa-6377-43b0-a37b-33a40bca44d4',
         '11248F34-2837-EF11-86D4-6045BDEE16E6',
         11,
         'Columns',
         'Columns',
         'Optional column to store a comma-delimited list of columns for the DatasetItem',
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'acab0610-a4ea-433b-a39a-c2d6efb46f59'
       OR (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UserRating')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'acab0610-a4ea-433b-a39a-c2d6efb46f59',
         '12248F34-2837-EF11-86D4-6045BDEE16E6',
         10,
         'UserRating',
         'User Rating',
         'This column is used to capture user feedback as a rating scale. The scale ranges from 1 to 10, where 1 might represent thumbs down, and 10 might represent thumbs up or the highest rating in a star-based scale.',
         'int',
         4,
         10,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'c400a5f2-1be3-4441-aefa-06344a12aab2'
       OR (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UserFeedback')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'c400a5f2-1be3-4441-aefa-06344a12aab2',
         '12248F34-2837-EF11-86D4-6045BDEE16E6',
         11,
         'UserFeedback',
         'User Feedback',
         'This column is used to store user text feedback about a given AI response, describing what they liked or disliked.',
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'e69363f6-164f-41b8-b521-889b56493ce9'
       OR (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ReflectionInsights')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'e69363f6-164f-41b8-b521-889b56493ce9',
         '12248F34-2837-EF11-86D4-6045BDEE16E6',
         12,
         'ReflectionInsights',
         'Reflection Insights',
         'This column stores human or AI-generated reflections on how to improve future responses based on the user feedback and the AI output generated for prior messages in the conversation.',
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '21b640e1-d21e-4e4b-95bc-e9862fd11c8a'
       OR (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SummaryOfEarlierConversation')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '21b640e1-d21e-4e4b-95bc-e9862fd11c8a',
         '12248F34-2837-EF11-86D4-6045BDEE16E6',
         13,
         'SummaryOfEarlierConversation',
         'Summary Of Earlier Conversation',
         'This column optionally stores a summary of the entire conversation leading up to this particular conversation detail record. It is used in long-running conversations to optimize performance by summarizing earlier parts.',
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '62e7e3da-d9a7-42b6-8316-84aa7e66c469'
       OR (EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SupportsScheduledSending')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '62e7e3da-d9a7-42b6-8316-84aa7e66c469',
         '43248F34-2837-EF11-86D4-6045BDEE16E6',
         9,
         'SupportsScheduledSending',
         'Supports Scheduled Sending',
         'Whether or not the provider supports sending messages at a specific time',
         'bit',
         1,
         1,
         0,
         0,
         '(0)',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Dropdown'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '7321b323-7f8b-4dcd-ae44-01fce8aab7ef'
       OR (EntityID = '4B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'OrderBy')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '7321b323-7f8b-4dcd-ae44-01fce8aab7ef',
         '4B248F34-2837-EF11-86D4-6045BDEE16E6',
         15,
         'OrderBy',
         'Order By',
         'This field is used only when the Type of the TemplateParam table is "Entity". It is an optional field used to specify the sorting order for the related entity data that is used in the template for the Entity specified.',
         'nvarchar',
         -1,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '99eb5364-1b2b-430b-bc94-709c6d26aa08'
       OR (EntityID = '201852E1-4587-EF11-8473-6045BDF077EE' AND Name = 'ResourceType')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '99eb5364-1b2b-430b-bc94-709c6d26aa08',
         '201852E1-4587-EF11-8473-6045BDF077EE',
         13,
         'ResourceType',
         'Resource Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'ea65a64e-9935-4702-aedd-a2a4bdc1bcd2'
       OR (EntityID = '201852E1-4587-EF11-8473-6045BDF077EE' AND Name = 'Role')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'ea65a64e-9935-4702-aedd-a2a4bdc1bcd2',
         '201852E1-4587-EF11-8473-6045BDF077EE',
         14,
         'Role',
         'Role',
         NULL,
         'nvarchar',
         100,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '1a164f09-d65d-4b1f-b954-f1a2201427f0'
       OR (EntityID = '201852E1-4587-EF11-8473-6045BDF077EE' AND Name = 'User')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '1a164f09-d65d-4b1f-b954-f1a2201427f0',
         '201852E1-4587-EF11-8473-6045BDF077EE',
         15,
         'User',
         'User',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '4b012aeb-14bf-4ad2-99cf-df6732f55d70'
       OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Source')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '4b012aeb-14bf-4ad2-99cf-df6732f55d70',
         '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
         9,
         'Source',
         'Source',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '91a88b6d-ec50-4d86-ab4f-e637264e706f'
       OR (EntityID = 'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentSource')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '91a88b6d-ec50-4d86-ab4f-e637264e706f',
         'B12E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         'ContentSource',
         'Content Source',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'addf8ac9-bf3a-4ecb-af21-5c04da27c396'
       OR (EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'AIModel')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'addf8ac9-bf3a-4ecb-af21-5c04da27c396',
         'A793AD50-0E66-EF11-A752-C0A5E8ACCB22',
         9,
         'AIModel',
         'AIModel',
         NULL,
         'nvarchar',
         100,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'c1b90859-5c3a-46cc-8b10-cf89f97ee38b'
       OR (EntityID = 'F13EC656-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentItem')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'c1b90859-5c3a-46cc-8b10-cf89f97ee38b',
         'F13EC656-0E66-EF11-A752-C0A5E8ACCB22',
         7,
         'ContentItem',
         'Content Item',
         NULL,
         'nvarchar',
         500,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '8d73962b-3d7d-489e-837f-732c90578325'
       OR (EntityID = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Item')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '8d73962b-3d7d-489e-837f-732c90578325',
         'F63EC656-0E66-EF11-A752-C0A5E8ACCB22',
         6,
         'Item',
         'Item',
         NULL,
         'nvarchar',
         500,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END


/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('61670B7F-B013-4194-B529-753D117F8CE2', 1, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('61670B7F-B013-4194-B529-753D117F8CE2', 2, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('61670B7F-B013-4194-B529-753D117F8CE2', 3, 'Disabled', 'Disabled')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('61670B7F-B013-4194-B529-753D117F8CE2', 4, 'Rejected', 'Rejected')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('61670B7F-B013-4194-B529-753D117F8CE2', 5, 'Complete', 'Complete')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('61670B7F-B013-4194-B529-753D117F8CE2', 6, 'Error', 'Error')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('61670B7F-B013-4194-B529-753D117F8CE2', 7, 'Other', 'Other')

/* SQL text to update ValueListType for entity field ID 61670B7F-B013-4194-B529-753D117F8CE2 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='61670B7F-B013-4194-B529-753D117F8CE2'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to create Entitiy Relationships */
IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityRelationship
    WHERE ID = '09541d11-8e3f-4586-9154-b15be835d463'
)
BEGIN
   INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                             VALUES ('09541d11-8e3f-4586-9154-b15be835d463', '7DAD0238-8B56-EF11-991A-6045BDEBA539', '7DAD0238-8B56-EF11-991A-6045BDEBA539', 'ParentID', 'One To Many', 1, 1, 'AI Prompt Categories', 2);
END

/* SQL text to create Entitiy Relationships */
IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityRelationship
    WHERE ID = 'bef6f2c7-8f9c-4e60-95f6-42bde2beb0c3'
)BEGIN
   INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                             VALUES ('bef6f2c7-8f9c-4e60-95f6-42bde2beb0c3', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '78AD0238-8B56-EF11-991A-6045BDEBA539', 'AIModelID', 'One To Many', 1, 1, 'AI Result Cache', 1);
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityRelationship
    WHERE ID = 'f7324545-fca7-4aca-9596-02673ca81e7b'
)
BEGIN
   INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                             VALUES ('f7324545-fca7-4aca-9596-02673ca81e7b', '48248F34-2837-EF11-86D4-6045BDEE16E6', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'TemplateID', 'One To Many', 1, 1, 'AI Prompts', 2);
END

/* SQL text to update entity field related entity name field map for entity field ID 3DDE5E8E-A83B-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3DDE5E8E-A83B-EF11-86D4-0022481D1B23',
         @RelatedEntityNameFieldMap='CreatedByUser'

/* SQL text to update entity field related entity name field map for entity field ID 250644A9-0A3C-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='250644A9-0A3C-EF11-86D4-0022481D1B23',
         @RelatedEntityNameFieldMap='ScheduledAction'

/* SQL text to update entity field related entity name field map for entity field ID 260644A9-0A3C-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='260644A9-0A3C-EF11-86D4-0022481D1B23',
         @RelatedEntityNameFieldMap='ActionParam'

/* SQL text to update entity field related entity name field map for entity field ID 3EDE5E8E-A83B-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3EDE5E8E-A83B-EF11-86D4-0022481D1B23',
         @RelatedEntityNameFieldMap='Action'

/* SQL text to update entity field related entity name field map for entity field ID AE4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AE4C17F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='Category'

/* SQL text to update entity field related entity name field map for entity field ID 017B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='017B842E-AA38-EF11-86D4-000D3A4E707E',
         @RelatedEntityNameFieldMap='AuditLogType'

/* SQL text to update entity field related entity name field map for entity field ID 027B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='027B842E-AA38-EF11-86D4-000D3A4E707E',
         @RelatedEntityNameFieldMap='Authorization'

/* SQL text to update entity field related entity name field map for entity field ID 037B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='037B842E-AA38-EF11-86D4-000D3A4E707E',
         @RelatedEntityNameFieldMap='Authorization'

/* SQL text to update entity field related entity name field map for entity field ID 057B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='057B842E-AA38-EF11-86D4-000D3A4E707E',
         @RelatedEntityNameFieldMap='Authorization'

/* SQL text to update entity field related entity name field map for entity field ID 047B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='047B842E-AA38-EF11-86D4-000D3A4E707E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID C88C8778-B939-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C88C8778-B939-EF11-86D4-000D3A4E707E',
         @RelatedEntityNameFieldMap='Dataset'

/* SQL text to update entity field related entity name field map for entity field ID EB4E17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EB4E17F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='DataContext'

/* SQL text to update entity field related entity name field map for entity field ID 534317F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='534317F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='ApprovedByUser'

/* SQL text to update entity field related entity name field map for entity field ID 7C4E17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7C4E17F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='Query'

/* SQL text to update entity field related entity name field map for entity field ID 167B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='167B842E-AA38-EF11-86D4-000D3A4E707E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID EC4317F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EC4317F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID 294F17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='294F17F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='EntityDocument'

/* SQL text to update entity field related entity name field map for entity field ID EF4317F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EF4317F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='VectorIndex'

/* SQL text to update entity field related entity name field map for entity field ID 2A4F17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2A4F17F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='VectorDatabase'

/* SQL text to update entity field related entity name field map for entity field ID 114F17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='114F17F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID B0EB26E0-3E3B-EF11-86D4-0022481D1B23 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B0EB26E0-3E3B-EF11-86D4-0022481D1B23',
         @RelatedEntityNameFieldMap='Template'

/* SQL text to update entity field related entity name field map for entity field ID 2B4F17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2B4F17F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID C98C8778-B939-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C98C8778-B939-EF11-86D4-000D3A4E707E',
         @RelatedEntityNameFieldMap='Application'

/* SQL text to update entity field related entity name field map for entity field ID 237B842E-AA38-EF11-86D4-000D3A4E707E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='237B842E-AA38-EF11-86D4-000D3A4E707E',
         @RelatedEntityNameFieldMap='Authorization'

/* SQL text to update entity field related entity name field map for entity field ID AC4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AC4C17F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='Parent'

/* SQL text to update entity field related entity name field map for entity field ID AD4C17F0-6F36-EF11-86D4-6045BDEE16E6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AD4C17F0-6F36-EF11-86D4-6045BDEE16E6',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID E0C3FD0E-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E0C3FD0E-8FA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID BE6DCA20-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BE6DCA20-8FA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID E4C3FD0E-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E4C3FD0E-8FA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID BF6DCA20-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BF6DCA20-8FA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID E5C3FD0E-8FA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E5C3FD0E-8FA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 2A072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2A072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 33072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='33072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 34072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='34072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 35072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='35072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 3A072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3A072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 4F072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4F072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 61072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='61072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 6D072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6D072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 73072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='73072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 64072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='64072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 65072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='65072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 66072FEB-8EA7-EF11-AFEF-286B35C04427 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='66072FEB-8EA7-EF11-AFEF-286B35C04427',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'ef6a3542-abfb-41e6-878f-2db51b5695f4'
       OR (EntityID = '12CD5A5D-A83B-EF11-86D4-0022481D1B23' AND Name = 'CreatedByUser')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'ef6a3542-abfb-41e6-878f-2db51b5695f4',
         '12CD5A5D-A83B-EF11-86D4-0022481D1B23',
         17,
         'CreatedByUser',
         'Created By User',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'd15f64aa-cb3b-4d07-a39d-152b90e89171'
       OR (EntityID = '12CD5A5D-A83B-EF11-86D4-0022481D1B23' AND Name = 'Action')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'd15f64aa-cb3b-4d07-a39d-152b90e89171',
         '12CD5A5D-A83B-EF11-86D4-0022481D1B23',
         18,
         'Action',
         'Action',
         NULL,
         'nvarchar',
         850,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '16daf709-095c-479c-9bbe-fac5a67828fa'
       OR (EntityID = '58E4EE77-0A3C-EF11-86D4-0022481D1B23' AND Name = 'ScheduledAction')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '16daf709-095c-479c-9bbe-fac5a67828fa',
         '58E4EE77-0A3C-EF11-86D4-0022481D1B23',
         9,
         'ScheduledAction',
         'Scheduled Action',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '2d4d0b1f-4b07-4f45-af85-afb46d9a8f18'
       OR (EntityID = '58E4EE77-0A3C-EF11-86D4-0022481D1B23' AND Name = 'ActionParam')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '2d4d0b1f-4b07-4f45-af85-afb46d9a8f18',
         '58E4EE77-0A3C-EF11-86D4-0022481D1B23',
         10,
         'ActionParam',
         'Action Param',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '7cb4656e-44e7-450b-9e8e-97737dedc32d'
       OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Category')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '7cb4656e-44e7-450b-9e8e-97737dedc32d',
         'EE238F34-2837-EF11-86D4-6045BDEE16E6',
         13,
         'Category',
         'Category',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'c626b7a2-89b4-43b9-8caf-435845475574'
       OR (EntityID = 'F8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AuditLogType')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'c626b7a2-89b4-43b9-8caf-435845475574',
         'F8238F34-2837-EF11-86D4-6045BDEE16E6',
         13,
         'AuditLogType',
         'Audit Log Type',
         NULL,
         'nvarchar',
         100,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'a24cabe7-8b5f-4e8b-ab5a-a51429bbdb94'
       OR (EntityID = 'F8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Authorization')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'a24cabe7-8b5f-4e8b-ab5a-a51429bbdb94',
         'F8238F34-2837-EF11-86D4-6045BDEE16E6',
         14,
         'Authorization',
         'Authorization',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '7649e7fd-8747-48db-aa22-2c755282b355'
       OR (EntityID = 'FA238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Authorization')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '7649e7fd-8747-48db-aa22-2c755282b355',
         'FA238F34-2837-EF11-86D4-6045BDEE16E6',
         7,
         'Authorization',
         'Authorization',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '0521b8cf-21cf-49f4-ba78-17003d985ecd'
       OR (EntityID = 'FA238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Role')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '0521b8cf-21cf-49f4-ba78-17003d985ecd',
         'FA238F34-2837-EF11-86D4-6045BDEE16E6',
         8,
         'Role',
         'Role',
         NULL,
         'nvarchar',
         100,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '69ed416e-ef7b-4962-b97b-a67c2b1e2f04'
       OR (EntityID = 'FB238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Authorization')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '69ed416e-ef7b-4962-b97b-a67c2b1e2f04',
         'FB238F34-2837-EF11-86D4-6045BDEE16E6',
         9,
         'Authorization',
         'Authorization',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Dropdown'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'daccbb04-dee3-47e6-8a6a-e69c7bb62435'
       OR (EntityID = '11248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Dataset')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'daccbb04-dee3-47e6-8a6a-e69c7bb62435',
         '11248F34-2837-EF11-86D4-6045BDEE16E6',
         12,
         'Dataset',
         'Dataset',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '1ae26d76-2246-4fd4-8bcb-04c1953e2612'
       OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DataContext')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '1ae26d76-2246-4fd4-8bcb-04c1953e2612',
         '13248F34-2837-EF11-86D4-6045BDEE16E6',
         15,
         'DataContext',
         'Data Context',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '88e1cce0-718d-4c29-8b32-ed103afa5d44'
       OR (EntityID = '17248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ApprovedByUser')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '88e1cce0-718d-4c29-8b32-ed103afa5d44',
         '17248F34-2837-EF11-86D4-6045BDEE16E6',
         16,
         'ApprovedByUser',
         'Approved By User',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'ffde4a3d-f2f7-4c14-8849-1cef8a2c2738'
       OR (EntityID = '1C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Query')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'ffde4a3d-f2f7-4c14-8849-1cef8a2c2738',
         '1C248F34-2837-EF11-86D4-6045BDEE16E6',
         6,
         'Query',
         'Query',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '68961fd2-949b-499a-838c-fbb37c6f90b3'
       OR (EntityID = '1C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Role')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '68961fd2-949b-499a-838c-fbb37c6f90b3',
         '1C248F34-2837-EF11-86D4-6045BDEE16E6',
         7,
         'Role',
         'Role',
         NULL,
         'nvarchar',
         100,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '673c20c4-0564-44ae-a5a5-05c5078e9ad9'
       OR (EntityID = '21248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Entity')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '673c20c4-0564-44ae-a5a5-05c5078e9ad9',
         '21248F34-2837-EF11-86D4-6045BDEE16E6',
         12,
         'Entity',
         'Entity',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '4bdaaec2-000a-4420-b7ed-6636f97e8a17'
       OR (EntityID = '21248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityDocument')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '4bdaaec2-000a-4420-b7ed-6636f97e8a17',
         '21248F34-2837-EF11-86D4-6045BDEE16E6',
         13,
         'EntityDocument',
         'Entity Document',
         NULL,
         'nvarchar',
         500,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '31fdcb9d-a261-4216-95da-069ddb5891e3'
       OR (EntityID = '21248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'VectorIndex')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '31fdcb9d-a261-4216-95da-069ddb5891e3',
         '21248F34-2837-EF11-86D4-6045BDEE16E6',
         14,
         'VectorIndex',
         'Vector Index',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'ccadd97e-8e07-4b42-a16f-adcff9f9b385'
       OR (EntityID = '22248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'VectorDatabase')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'ccadd97e-8e07-4b42-a16f-adcff9f9b385',
         '22248F34-2837-EF11-86D4-6045BDEE16E6',
         15,
         'VectorDatabase',
         'Vector Database',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'af9d284c-da9c-409b-abb0-4bb4aa1f778f'
       OR (EntityID = '22248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Template')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'af9d284c-da9c-409b-abb0-4bb4aa1f778f',
         '22248F34-2837-EF11-86D4-6045BDEE16E6',
         16,
         'Template',
         'Template',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'eae4fa06-2e28-4959-9179-7c6420f7fe60'
       OR (EntityID = '22248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AIModel')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'eae4fa06-2e28-4959-9179-7c6420f7fe60',
         '22248F34-2837-EF11-86D4-6045BDEE16E6',
         17,
         'AIModel',
         'AIModel',
         NULL,
         'nvarchar',
         100,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'ca51b66a-fd30-4244-87d5-23deba26b2db'
       OR (EntityID = '25248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Entity')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'ca51b66a-fd30-4244-87d5-23deba26b2db',
         '25248F34-2837-EF11-86D4-6045BDEE16E6',
         10,
         'Entity',
         'Entity',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Dropdown'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'dba98fcb-beb7-49ac-ab5b-b7d1baf855b8'
       OR (EntityID = '32248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Application')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'dba98fcb-beb7-49ac-ab5b-b7d1baf855b8',
         '32248F34-2837-EF11-86D4-6045BDEE16E6',
         8,
         'Application',
         'Application',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '0158d44e-61fb-4f0a-8dc1-3c1b264e0570'
       OR (EntityID = '36248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Authorization')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '0158d44e-61fb-4f0a-8dc1-3c1b264e0570',
         '36248F34-2837-EF11-86D4-6045BDEE16E6',
         8,
         'Authorization',
         'Authorization',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '6f486b8f-40f5-4fae-9513-ccdeeee539ad'
       OR (EntityID = '42248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Parent')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '6f486b8f-40f5-4fae-9513-ccdeeee539ad',
         '42248F34-2837-EF11-86D4-6045BDEE16E6',
         8,
         'Parent',
         'Parent',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Dropdown'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'f222da6c-1b72-4453-be13-9500b038cbf1'
       OR (EntityID = '42248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'User')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'f222da6c-1b72-4453-be13-9500b038cbf1',
         '42248F34-2837-EF11-86D4-6045BDEE16E6',
         9,
         'User',
         'User',
         NULL,
         'nvarchar',
         200,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Dropdown'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '8e282ad9-2695-4f04-ac1f-79a5380d4e4d'
       OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentType')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '8e282ad9-2695-4f04-ac1f-79a5380d4e4d',
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         9,
         'ContentType',
         'Content Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'fbb09b21-50a3-4cce-a114-44b0c9835251'
       OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentSourceType')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'fbb09b21-50a3-4cce-a114-44b0c9835251',
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         10,
         'ContentSourceType',
         'Content Source Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'aba84e45-fde6-4fd0-acc9-bda83a8cde17'
       OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentFileType')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'aba84e45-fde6-4fd0-acc9-bda83a8cde17',
         'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
         11,
         'ContentFileType',
         'Content File Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '0bd076e0-a5d2-4af8-b9a7-646d342dbef4'
       OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentSource')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '0bd076e0-a5d2-4af8-b9a7-646d342dbef4',
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         13,
         'ContentSource',
         'Content Source',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         1,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = '064aa602-a3d4-4192-88c4-6f96efdf0f18'
       OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentType')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '064aa602-a3d4-4192-88c4-6f96efdf0f18',
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         14,
         'ContentType',
         'Content Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'efa43d7e-c671-48a6-8733-8b75ca8b3cc1'
       OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentSourceType')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'efa43d7e-c671-48a6-8733-8b75ca8b3cc1',
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         15,
         'ContentSourceType',
         'Content Source Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

IF NOT EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].EntityField
    WHERE ID = 'e13cb38f-1fb7-439c-a962-ed7f91de0bff'
       OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentFileType')
)
BEGIN
      INSERT INTO [${flyway:defaultSchema}].EntityField

      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'e13cb38f-1fb7-439c-a962-ed7f91de0bff',
         'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
         16,
         'ContentFileType',
         'Content File Type',
         NULL,
         'nvarchar',
         510,
         0,
         0,
         0,
         'null',
         0,
         0,
         1,
         NULL,
         NULL,
         0,
         0,
         0,
         0,
         0,
         0,
         'Search'
      )
END

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

