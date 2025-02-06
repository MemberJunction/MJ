/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4ebeb02b-ac46-4440-948f-0fcd6c6c26de'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'ResponseFormat')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            '4ebeb02b-ac46-4440-948f-0fcd6c6c26de',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            12,
            'ResponseFormat',
            'Response Format',
            'Specifies the expected response format for the AI model. Options include Any, Text, Markdown, JSON, and ModelSpecific. Defaults to Any if not specified.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Any',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'dac94188-e300-4af8-9cd1-7ed8aff561bf'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'ModelSpecificResponseFormat')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            'dac94188-e300-4af8-9cd1-7ed8aff561bf',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Prompts
            13,
            'ModelSpecificResponseFormat',
            'Model Specific Response Format',
            'A JSON-formatted string containing model-specific response format instructions. This will be parsed and provided as a JSON object to the model.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0c2449fb-1bda-4be9-a059-7224c05a14b9'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScopeDefault')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            '0c2449fb-1bda-4be9-a059-7224c05a14b9',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            41,
            'ScopeDefault',
            'Scope Default',
            'A comma-delimited string indicating the default scope for field visibility. Options include Users, Admins, AI, and All. Defaults to All when NULL. This is used for a simple method of filtering field defaults for visibility, not security enforcement.',
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ffc3c691-2e33-46d0-b11c-ab348997e08c'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateRelatedEntityInfo')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            'ffc3c691-2e33-46d0-b11c-ab348997e08c',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            42,
            'AutoUpdateRelatedEntityInfo',
            'Auto Update Related Entity Info',
            'Indicates whether the related entity information should be automatically updated from the database schema. When set to 0, relationships not part of the database schema can be manually defined at the application and AI agent level. Defaults to 1.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '20818e34-47e7-4371-a51e-3d29bcc4b4b8'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ValuesToPackWithSchema')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            '20818e34-47e7-4371-a51e-3d29bcc4b4b8',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            43,
            'ValuesToPackWithSchema',
            'Values To Pack With Schema',
            'Determines whether values for the field should be included when the schema is packed. Options: Auto (include manually set or auto-derived values), None (exclude all values), All (include all distinct values from the table). Defaults to Auto.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'Auto',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bca2d814-7530-48f8-9ab7-dcef70ac5fc9'  OR 
               (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScopeDefault')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            'bca2d814-7530-48f8-9ab7-dcef70ac5fc9',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entities
            48,
            'ScopeDefault',
            'Scope Default',
            'Optional, comma-delimited string indicating the default scope for entity visibility. Options include Users, Admins, AI, and All. Defaults to All when NULL. This is used for simple defaults for filtering entity visibility, not security enforcement.',
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c6ac9cc7-0c99-46b4-9940-c5a9e60eed0a'  OR 
               (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RowsToPackWithSchema')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            'c6ac9cc7-0c99-46b4-9940-c5a9e60eed0a',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entities
            49,
            'RowsToPackWithSchema',
            'Rows To Pack With Schema',
            'Determines how entity rows should be packaged for external use. Options include None, Sample, and All. Defaults to None.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'None',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'efb53fa7-d868-4e1c-9932-a5e624092dc5'  OR 
               (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RowsToPackSampleMethod')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            'efb53fa7-d868-4e1c-9932-a5e624092dc5',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entities
            50,
            'RowsToPackSampleMethod',
            'Rows To Pack Sample Method',
            'Defines the sampling method for row packing when RowsToPackWithSchema is set to Sample. Options include random, top n, and bottom n. Defaults to random.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'random',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4b3b3bcb-9e96-4fb0-b2b2-93c676c43261'  OR 
               (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RowsToPackSampleCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            '4b3b3bcb-9e96-4fb0-b2b2-93c676c43261',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entities
            51,
            'RowsToPackSampleCount',
            'Rows To Pack Sample Count',
            'The number of rows to pack when RowsToPackWithSchema is set to Sample, based on the designated sampling method. Defaults to 0.',
            'int',
            4,
            10,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '29690283-5206-48ea-adf6-43c40da3220b'  OR 
               (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RowsToPackSampleOrder')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            '29690283-5206-48ea-adf6-43c40da3220b',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entities
            52,
            'RowsToPackSampleOrder',
            'Rows To Pack Sample Order',
            'An optional ORDER BY clause for row packing when RowsToPackWithSchema is set to Sample. Allows custom ordering for selected entity data when using top n and bottom n.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7e307d9f-a7fe-44a8-85d9-a97c85ef1c71'  OR 
               (EntityID = 'E2238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateFromSchema')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            '7e307d9f-a7fe-44a8-85d9-a97c85ef1c71',
            'E2238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Relationships
            23,
            'AutoUpdateFromSchema',
            'Auto Update From Schema',
            'Indicates whether this relationship should be automatically updated by CodeGen. When set to 0, the record will not be modified by CodeGen. Defaults to 1.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8b0575ec-3b6e-4f64-b9ac-052b44127021'  OR 
               (EntityID = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SupportedResponseFormats')
         -- check to make sure we're not inserting a duplicate entity field metadata record
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
            '8b0575ec-3b6e-4f64-b9ac-052b44127021',
            'FD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: AI Models
            17,
            'SupportedResponseFormats',
            'Supported Response Formats',
            'A comma-delimited string indicating the supported response formats for the AI model. Options include Any, Text, Markdown, JSON, and ModelSpecific. Defaults to Any if not specified.',
            'nvarchar',
            200,
            0,
            0,
            0,
            'Any',
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

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4EBEB02B-AC46-4440-948F-0FCD6C6C26DE', 1, 'Any', 'Any')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4EBEB02B-AC46-4440-948F-0FCD6C6C26DE', 2, 'Text', 'Text')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4EBEB02B-AC46-4440-948F-0FCD6C6C26DE', 3, 'Markdown', 'Markdown')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4EBEB02B-AC46-4440-948F-0FCD6C6C26DE', 4, 'JSON', 'JSON')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4EBEB02B-AC46-4440-948F-0FCD6C6C26DE', 5, 'ModelSpecific', 'ModelSpecific')

/* SQL text to update ValueListType for entity field ID 4EBEB02B-AC46-4440-948F-0FCD6C6C26DE */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='4EBEB02B-AC46-4440-948F-0FCD6C6C26DE'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C6AC9CC7-0C99-46B4-9940-C5A9E60EED0A', 1, 'None', 'None')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C6AC9CC7-0C99-46B4-9940-C5A9E60EED0A', 2, 'Sample', 'Sample')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C6AC9CC7-0C99-46B4-9940-C5A9E60EED0A', 3, 'All', 'All')

/* SQL text to update ValueListType for entity field ID C6AC9CC7-0C99-46B4-9940-C5A9E60EED0A */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C6AC9CC7-0C99-46B4-9940-C5A9E60EED0A'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('EFB53FA7-D868-4E1C-9932-A5E624092DC5', 1, 'random', 'random')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('EFB53FA7-D868-4E1C-9932-A5E624092DC5', 2, 'top n', 'top n')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('EFB53FA7-D868-4E1C-9932-A5E624092DC5', 3, 'bottom n', 'bottom n')

/* SQL text to update ValueListType for entity field ID EFB53FA7-D868-4E1C-9932-A5E624092DC5 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='EFB53FA7-D868-4E1C-9932-A5E624092DC5'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('20818E34-47E7-4371-A51E-3D29BCC4B4B8', 1, 'Auto', 'Auto')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('20818E34-47E7-4371-A51E-3D29BCC4B4B8', 2, 'None', 'None')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('20818E34-47E7-4371-A51E-3D29BCC4B4B8', 3, 'All', 'All')

/* SQL text to update ValueListType for entity field ID 20818E34-47E7-4371-A51E-3D29BCC4B4B8 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='20818E34-47E7-4371-A51E-3D29BCC4B4B8'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* Index for Foreign Keys for ScheduledAction */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Actions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CreatedByUserID in table ScheduledAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledAction_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledAction_CreatedByUserID ON [${flyway:defaultSchema}].[ScheduledAction] ([CreatedByUserID]);

-- Index for foreign key ActionID in table ScheduledAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledAction_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledAction_ActionID ON [${flyway:defaultSchema}].[ScheduledAction] ([ActionID]);

/* Index for Foreign Keys for ScheduledActionParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ScheduledActionID in table ScheduledActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledActionParam_ScheduledActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledActionParam_ScheduledActionID ON [${flyway:defaultSchema}].[ScheduledActionParam] ([ScheduledActionID]);

-- Index for foreign key ActionParamID in table ScheduledActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledActionParam_ActionParamID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledActionParam_ActionParamID ON [${flyway:defaultSchema}].[ScheduledActionParam] ([ActionParamID]);

/* Base View SQL for Scheduled Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Actions
-- Item: vwScheduledActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Scheduled Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ScheduledAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwScheduledActions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwScheduledActions]
AS
SELECT
    s.*,
    User_CreatedByUserID.[Name] AS [CreatedByUser],
    Action_ActionID.[Name] AS [Action]
FROM
    [${flyway:defaultSchema}].[ScheduledAction] AS s
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_CreatedByUserID
  ON
    [s].[CreatedByUserID] = User_CreatedByUserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ActionID
  ON
    [s].[ActionID] = Action_ActionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Scheduled Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Actions
-- Item: Permissions for vwScheduledActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Scheduled Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Actions
-- Item: spCreateScheduledAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScheduledAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateScheduledAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledAction]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CreatedByUserID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Type nvarchar(20),
    @CronExpression nvarchar(100),
    @Timezone nvarchar(100),
    @Status nvarchar(20),
    @IntervalDays int,
    @DayOfWeek nvarchar(20),
    @DayOfMonth int,
    @Month nvarchar(20),
    @CustomCronExpression nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ScheduledAction]
        (
            [Name],
            [Description],
            [CreatedByUserID],
            [ActionID],
            [Type],
            [CronExpression],
            [Timezone],
            [Status],
            [IntervalDays],
            [DayOfWeek],
            [DayOfMonth],
            [Month],
            [CustomCronExpression]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @CreatedByUserID,
            @ActionID,
            @Type,
            @CronExpression,
            @Timezone,
            @Status,
            @IntervalDays,
            @DayOfWeek,
            @DayOfMonth,
            @Month,
            @CustomCronExpression
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwScheduledActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledAction] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Scheduled Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledAction] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Scheduled Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Actions
-- Item: spUpdateScheduledAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScheduledAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateScheduledAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledAction]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CreatedByUserID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Type nvarchar(20),
    @CronExpression nvarchar(100),
    @Timezone nvarchar(100),
    @Status nvarchar(20),
    @IntervalDays int,
    @DayOfWeek nvarchar(20),
    @DayOfMonth int,
    @Month nvarchar(20),
    @CustomCronExpression nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledAction]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [CreatedByUserID] = @CreatedByUserID,
        [ActionID] = @ActionID,
        [Type] = @Type,
        [CronExpression] = @CronExpression,
        [Timezone] = @Timezone,
        [Status] = @Status,
        [IntervalDays] = @IntervalDays,
        [DayOfWeek] = @DayOfWeek,
        [DayOfMonth] = @DayOfMonth,
        [Month] = @Month,
        [CustomCronExpression] = @CustomCronExpression
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwScheduledActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledAction] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ScheduledAction table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateScheduledAction
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateScheduledAction
ON [${flyway:defaultSchema}].[ScheduledAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledAction]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ScheduledAction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Scheduled Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledAction] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Scheduled Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Actions
-- Item: spDeleteScheduledAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteScheduledAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ScheduledAction]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledAction] TO [cdp_Integration]
    

/* spDelete Permissions for Scheduled Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledAction] TO [cdp_Integration]



/* Base View SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: vwScheduledActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Scheduled Action Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ScheduledActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwScheduledActionParams]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwScheduledActionParams]
AS
SELECT
    s.*,
    ScheduledAction_ScheduledActionID.[Name] AS [ScheduledAction],
    ActionParam_ActionParamID.[Name] AS [ActionParam]
FROM
    [${flyway:defaultSchema}].[ScheduledActionParam] AS s
INNER JOIN
    [${flyway:defaultSchema}].[ScheduledAction] AS ScheduledAction_ScheduledActionID
  ON
    [s].[ScheduledActionID] = ScheduledAction_ScheduledActionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ActionParam] AS ActionParam_ActionParamID
  ON
    [s].[ActionParamID] = ActionParam_ActionParamID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: Permissions for vwScheduledActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: spCreateScheduledActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScheduledActionParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateScheduledActionParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledActionParam]
    @ScheduledActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ScheduledActionParam]
        (
            [ScheduledActionID],
            [ActionParamID],
            [ValueType],
            [Value],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ScheduledActionID,
            @ActionParamID,
            @ValueType,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwScheduledActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledActionParam] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Scheduled Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledActionParam] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: spUpdateScheduledActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScheduledActionParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateScheduledActionParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledActionParam]
    @ID uniqueidentifier,
    @ScheduledActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledActionParam]
    SET
        [ScheduledActionID] = @ScheduledActionID,
        [ActionParamID] = @ActionParamID,
        [ValueType] = @ValueType,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwScheduledActionParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledActionParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ScheduledActionParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateScheduledActionParam
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateScheduledActionParam
ON [${flyway:defaultSchema}].[ScheduledActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledActionParam]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ScheduledActionParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Scheduled Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledActionParam] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Scheduled Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Scheduled Action Params
-- Item: spDeleteScheduledActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledActionParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteScheduledActionParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledActionParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ScheduledActionParam]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledActionParam] TO [cdp_Integration]
    

/* spDelete Permissions for Scheduled Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledActionParam] TO [cdp_Integration]



/* Index for Foreign Keys for AIPrompt */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TemplateID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID ON [${flyway:defaultSchema}].[AIPrompt] ([TemplateID]);

-- Index for foreign key CategoryID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID ON [${flyway:defaultSchema}].[AIPrompt] ([CategoryID]);

-- Index for foreign key TypeID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TypeID ON [${flyway:defaultSchema}].[AIPrompt] ([TypeID]);

/* Base View SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Prompts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPrompts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPrompts]
AS
SELECT
    a.*,
    Template_TemplateID.[Name] AS [Template],
    AIPromptCategory_CategoryID.[Name] AS [Category],
    AIPromptType_TypeID.[Name] AS [Type]
FROM
    [${flyway:defaultSchema}].[AIPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_TemplateID
  ON
    [a].[TemplateID] = Template_TemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS AIPromptCategory_CategoryID
  ON
    [a].[CategoryID] = AIPromptCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptType] AS AIPromptType_TypeID
  ON
    [a].[TypeID] = AIPromptType_TypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: Permissions for vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spCreateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @CacheResults bit,
    @CacheExpiration decimal(10, 2),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIPrompt]
        (
            [Name],
            [Description],
            [TemplateID],
            [CategoryID],
            [TypeID],
            [Status],
            [CacheResults],
            [CacheExpiration],
            [ResponseFormat],
            [ModelSpecificResponseFormat]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @TemplateID,
            @CategoryID,
            @TypeID,
            @Status,
            @CacheResults,
            @CacheExpiration,
            @ResponseFormat,
            @ModelSpecificResponseFormat
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for AI Prompts */




/* spUpdate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spUpdateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPrompt]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @CacheResults bit,
    @CacheExpiration decimal(10, 2),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [TemplateID] = @TemplateID,
        [CategoryID] = @CategoryID,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [CacheResults] = @CacheResults,
        [CacheExpiration] = @CacheExpiration,
        [ResponseFormat] = @ResponseFormat,
        [ModelSpecificResponseFormat] = @ModelSpecificResponseFormat
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPrompts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPrompt
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPrompt
ON [${flyway:defaultSchema}].[AIPrompt]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPrompt] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Prompts */




/* spDelete SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for AI Prompts */




/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [${flyway:defaultSchema}].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [${flyway:defaultSchema}].[EntityField] ([RelatedEntityID]);

/* Base View Permissions SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[EntityField]
        (
            [DisplayName],
            [Description],
            [AutoUpdateDescription],
            [IsPrimaryKey],
            [IsUnique],
            [Category],
            [ValueListType],
            [ExtendedType],
            [CodeType],
            [DefaultInView],
            [ViewCellTemplate],
            [DefaultColumnWidth],
            [AllowUpdateAPI],
            [AllowUpdateInView],
            [IncludeInUserSearchAPI],
            [FullTextSearchEnabled],
            [UserSearchParamFormatAPI],
            [IncludeInGeneratedForm],
            [GeneratedFormSection],
            [IsNameField],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IncludeRelatedEntityNameFieldInBaseView],
            [RelatedEntityNameFieldMap],
            [RelatedEntityDisplayType],
            [EntityIDFieldName],
            [ScopeDefault],
            [AutoUpdateRelatedEntityInfo],
            [ValuesToPackWithSchema]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @DisplayName,
            @Description,
            @AutoUpdateDescription,
            @IsPrimaryKey,
            @IsUnique,
            @Category,
            @ValueListType,
            @ExtendedType,
            @CodeType,
            @DefaultInView,
            @ViewCellTemplate,
            @DefaultColumnWidth,
            @AllowUpdateAPI,
            @AllowUpdateInView,
            @IncludeInUserSearchAPI,
            @FullTextSearchEnabled,
            @UserSearchParamFormatAPI,
            @IncludeInGeneratedForm,
            @GeneratedFormSection,
            @IsNameField,
            @RelatedEntityID,
            @RelatedEntityFieldName,
            @IncludeRelatedEntityNameFieldInBaseView,
            @RelatedEntityNameFieldMap,
            @RelatedEntityDisplayType,
            @EntityIDFieldName,
            @ScopeDefault,
            @AutoUpdateRelatedEntityInfo,
            @ValuesToPackWithSchema
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the EntityField table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityField
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityField
ON [${flyway:defaultSchema}].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntityField]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityField]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

/* Base View Permissions SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Entity]
        (
            [ParentID],
            [Name],
            [NameSuffix],
            [Description],
            [AutoUpdateDescription],
            [BaseView],
            [BaseViewGenerated],
            [VirtualEntity],
            [TrackRecordChanges],
            [AuditRecordAccess],
            [AuditViewRuns],
            [IncludeInAPI],
            [AllowAllRowsAPI],
            [AllowUpdateAPI],
            [AllowCreateAPI],
            [AllowDeleteAPI],
            [CustomResolverAPI],
            [AllowUserSearchAPI],
            [FullTextSearchEnabled],
            [FullTextCatalog],
            [FullTextCatalogGenerated],
            [FullTextIndex],
            [FullTextIndexGenerated],
            [FullTextSearchFunction],
            [FullTextSearchFunctionGenerated],
            [UserViewMaxRows],
            [spCreate],
            [spUpdate],
            [spDelete],
            [spCreateGenerated],
            [spUpdateGenerated],
            [spDeleteGenerated],
            [CascadeDeletes],
            [DeleteType],
            [AllowRecordMerge],
            [spMatch],
            [RelationshipDefaultDisplayType],
            [UserFormGenerated],
            [EntityObjectSubclassName],
            [EntityObjectSubclassImport],
            [PreferredCommunicationField],
            [Icon],
            [ScopeDefault],
            [RowsToPackWithSchema],
            [RowsToPackSampleMethod],
            [RowsToPackSampleCount],
            [RowsToPackSampleOrder]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ParentID,
            @Name,
            @NameSuffix,
            @Description,
            @AutoUpdateDescription,
            @BaseView,
            @BaseViewGenerated,
            @VirtualEntity,
            @TrackRecordChanges,
            @AuditRecordAccess,
            @AuditViewRuns,
            @IncludeInAPI,
            @AllowAllRowsAPI,
            @AllowUpdateAPI,
            @AllowCreateAPI,
            @AllowDeleteAPI,
            @CustomResolverAPI,
            @AllowUserSearchAPI,
            @FullTextSearchEnabled,
            @FullTextCatalog,
            @FullTextCatalogGenerated,
            @FullTextIndex,
            @FullTextIndexGenerated,
            @FullTextSearchFunction,
            @FullTextSearchFunctionGenerated,
            @UserViewMaxRows,
            @spCreate,
            @spUpdate,
            @spDelete,
            @spCreateGenerated,
            @spUpdateGenerated,
            @spDeleteGenerated,
            @CascadeDeletes,
            @DeleteType,
            @AllowRecordMerge,
            @spMatch,
            @RelationshipDefaultDisplayType,
            @UserFormGenerated,
            @EntityObjectSubclassName,
            @EntityObjectSubclassImport,
            @PreferredCommunicationField,
            @Icon,
            @ScopeDefault,
            @RowsToPackWithSchema,
            @RowsToPackSampleMethod,
            @RowsToPackSampleCount,
            @RowsToPackSampleOrder
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [DeleteType] = @DeleteType,
        [AllowRecordMerge] = @AllowRecordMerge,
        [spMatch] = @spMatch,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon,
        [ScopeDefault] = @ScopeDefault,
        [RowsToPackWithSchema] = @RowsToPackWithSchema,
        [RowsToPackSampleMethod] = @RowsToPackSampleMethod,
        [RowsToPackSampleCount] = @RowsToPackSampleCount,
        [RowsToPackSampleOrder] = @RowsToPackSampleOrder
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the Entity table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntity
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for EntityRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([RelatedEntityID]);

-- Index for foreign key DisplayUserViewID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayUserViewID]);

-- Index for foreign key DisplayComponentID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayComponentID]);

/* Base View Permissions SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Permissions for vwEntityRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRelationships] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spCreateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[EntityRelationship]
        (
            [EntityID],
            [Sequence],
            [RelatedEntityID],
            [BundleInAPI],
            [IncludeInParentAllQuery],
            [Type],
            [EntityKeyField],
            [RelatedEntityJoinField],
            [JoinView],
            [JoinEntityJoinField],
            [JoinEntityInverseJoinField],
            [DisplayInForm],
            [DisplayLocation],
            [DisplayName],
            [DisplayIconType],
            [DisplayIcon],
            [DisplayComponentID],
            [DisplayComponentConfiguration],
            [AutoUpdateFromSchema]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @Sequence,
            @RelatedEntityID,
            @BundleInAPI,
            @IncludeInParentAllQuery,
            @Type,
            @EntityKeyField,
            @RelatedEntityJoinField,
            @JoinView,
            @JoinEntityJoinField,
            @JoinEntityInverseJoinField,
            @DisplayInForm,
            @DisplayLocation,
            @DisplayName,
            @DisplayIconType,
            @DisplayIcon,
            @DisplayComponentID,
            @DisplayComponentConfiguration,
            @AutoUpdateFromSchema
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spUpdateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayLocation] = @DisplayLocation,
        [DisplayName] = @DisplayName,
        [DisplayIconType] = @DisplayIconType,
        [DisplayIcon] = @DisplayIcon,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration,
        [AutoUpdateFromSchema] = @AutoUpdateFromSchema
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the EntityRelationship table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityRelationship
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRelationship
ON [${flyway:defaultSchema}].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spDeleteEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityRelationship]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for List */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Lists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_EntityID ON [${flyway:defaultSchema}].[List] ([EntityID]);

-- Index for foreign key UserID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_UserID ON [${flyway:defaultSchema}].[List] ([UserID]);

-- Index for foreign key CategoryID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_CategoryID ON [${flyway:defaultSchema}].[List] ([CategoryID]);

-- Index for foreign key CompanyIntegrationID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_CompanyIntegrationID ON [${flyway:defaultSchema}].[List] ([CompanyIntegrationID]);

/* Base View SQL for Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Lists
-- Item: vwLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Lists
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  List
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwLists]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwLists]
AS
SELECT
    l.*,
    Entity_EntityID.[Name] AS [Entity],
    User_UserID.[Name] AS [User],
    ListCategory_CategoryID.[Name] AS [Category]
FROM
    [${flyway:defaultSchema}].[List] AS l
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [l].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [l].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ListCategory] AS ListCategory_CategoryID
  ON
    [l].[CategoryID] = ListCategory_CategoryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwLists] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Lists
-- Item: Permissions for vwLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwLists] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Lists
-- Item: spCreateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR List
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateList]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateList]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(100),
    @CompanyIntegrationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[List]
        (
            [Name],
            [Description],
            [EntityID],
            [UserID],
            [CategoryID],
            [ExternalSystemRecordID],
            [CompanyIntegrationID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @EntityID,
            @UserID,
            @CategoryID,
            @ExternalSystemRecordID,
            @CompanyIntegrationID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwLists] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateList] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Lists */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateList] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Lists
-- Item: spUpdateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR List
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateList]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateList]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @ExternalSystemRecordID nvarchar(100),
    @CompanyIntegrationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[List]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [EntityID] = @EntityID,
        [UserID] = @UserID,
        [CategoryID] = @CategoryID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [CompanyIntegrationID] = @CompanyIntegrationID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwLists]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the List table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateList
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateList
ON [${flyway:defaultSchema}].[List]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[List]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[List] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Lists */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Lists
-- Item: spDeleteList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR List
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteList]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteList]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[List]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Lists */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for AuditLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table AuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLog_UserID ON [${flyway:defaultSchema}].[AuditLog] ([UserID]);

-- Index for foreign key AuditLogTypeID in table AuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLog_AuditLogTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLog_AuditLogTypeID ON [${flyway:defaultSchema}].[AuditLog] ([AuditLogTypeID]);

-- Index for foreign key AuthorizationID in table AuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLog_AuthorizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLog_AuthorizationID ON [${flyway:defaultSchema}].[AuditLog] ([AuthorizationID]);

-- Index for foreign key EntityID in table AuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLog_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLog_EntityID ON [${flyway:defaultSchema}].[AuditLog] ([EntityID]);

/* Base View SQL for Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: vwAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Audit Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AuditLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAuditLogs]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAuditLogs]
AS
SELECT
    a.*,
    User_UserID.[Name] AS [User],
    AuditLogType_AuditLogTypeID.[Name] AS [AuditLogType],
    Authorization_AuthorizationID.[Name] AS [Authorization],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[AuditLog] AS a
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AuditLogType] AS AuditLogType_AuditLogTypeID
  ON
    [a].[AuditLogTypeID] = AuditLogType_AuditLogTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Authorization] AS Authorization_AuthorizationID
  ON
    [a].[AuthorizationID] = Authorization_AuthorizationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [a].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: Permissions for vwAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: spCreateAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AuditLog
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAuditLog]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAuditLog]
    @UserID uniqueidentifier,
    @AuditLogTypeID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @Details nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AuditLog]
        (
            [UserID],
            [AuditLogTypeID],
            [AuthorizationID],
            [Status],
            [Description],
            [Details],
            [EntityID],
            [RecordID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @AuditLogTypeID,
            @AuthorizationID,
            @Status,
            @Description,
            @Details,
            @EntityID,
            @RecordID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAuditLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLog] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLog] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Logs
-- Item: spUpdateAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AuditLog
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAuditLog]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAuditLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @AuditLogTypeID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @Details nvarchar(MAX),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuditLog]
    SET
        [UserID] = @UserID,
        [AuditLogTypeID] = @AuditLogTypeID,
        [AuthorizationID] = @AuthorizationID,
        [Status] = @Status,
        [Description] = @Description,
        [Details] = @Details,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAuditLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuditLog] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the AuditLog table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAuditLog
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAuditLog
ON [${flyway:defaultSchema}].[AuditLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuditLog]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AuditLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuditLog] TO [cdp_Developer]



/* Index for Foreign Keys for AuthorizationRole */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Authorization Roles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AuthorizationID in table AuthorizationRole
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuthorizationRole_AuthorizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuthorizationRole]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuthorizationRole_AuthorizationID ON [${flyway:defaultSchema}].[AuthorizationRole] ([AuthorizationID]);

-- Index for foreign key RoleID in table AuthorizationRole
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuthorizationRole_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuthorizationRole]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuthorizationRole_RoleID ON [${flyway:defaultSchema}].[AuthorizationRole] ([RoleID]);

/* Index for Foreign Keys for AuditLogType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Log Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AuditLogType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLogType_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLogType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLogType_ParentID ON [${flyway:defaultSchema}].[AuditLogType] ([ParentID]);

-- Index for foreign key AuthorizationID in table AuditLogType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuditLogType_AuthorizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuditLogType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuditLogType_AuthorizationID ON [${flyway:defaultSchema}].[AuditLogType] ([AuthorizationID]);

/* Index for Foreign Keys for AIModel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIModelTypeID in table AIModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModel_AIModelTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModel_AIModelTypeID ON [${flyway:defaultSchema}].[AIModel] ([AIModelTypeID]);

/* Base View SQL for Authorization Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Authorization Roles
-- Item: vwAuthorizationRoles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Authorization Roles
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AuthorizationRole
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAuthorizationRoles]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAuthorizationRoles]
AS
SELECT
    a.*,
    Authorization_AuthorizationID.[Name] AS [Authorization],
    Role_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[AuthorizationRole] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Authorization] AS Authorization_AuthorizationID
  ON
    [a].[AuthorizationID] = Authorization_AuthorizationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS Role_RoleID
  ON
    [a].[RoleID] = Role_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAuthorizationRoles] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Authorization Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Authorization Roles
-- Item: Permissions for vwAuthorizationRoles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAuthorizationRoles] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View SQL for Audit Log Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Log Types
-- Item: vwAuditLogTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Audit Log Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AuditLogType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAuditLogTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAuditLogTypes]
AS
SELECT
    a.*,
    AuditLogType_ParentID.[Name] AS [Parent],
    Authorization_AuthorizationID.[Name] AS [Authorization]
FROM
    [${flyway:defaultSchema}].[AuditLogType] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AuditLogType] AS AuditLogType_ParentID
  ON
    [a].[ParentID] = AuditLogType_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Authorization] AS Authorization_AuthorizationID
  ON
    [a].[AuthorizationID] = Authorization_AuthorizationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAuditLogTypes] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Audit Log Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Log Types
-- Item: Permissions for vwAuditLogTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAuditLogTypes] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* Base View SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: vwAIModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Models
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModels]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModels]
AS
SELECT
    a.*,
    AIModelType_AIModelTypeID.[Name] AS [AIModelType]
FROM
    [${flyway:defaultSchema}].[AIModel] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModelType] AS AIModelType_AIModelTypeID
  ON
    [a].[AIModelTypeID] = AIModelType_AIModelTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: Permissions for vwAIModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: spCreateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModel]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @Vendor nvarchar(50),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @SpeedRank int,
    @CostRank int,
    @ModelSelectionInsights nvarchar(MAX),
    @InputTokenLimit int,
    @SupportedResponseFormats nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModel]
        (
            [Name],
            [Description],
            [Vendor],
            [AIModelTypeID],
            [PowerRank],
            [IsActive],
            [DriverClass],
            [DriverImportPath],
            [APIName],
            [SpeedRank],
            [CostRank],
            [ModelSelectionInsights],
            [InputTokenLimit],
            [SupportedResponseFormats]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @Vendor,
            @AIModelTypeID,
            @PowerRank,
            @IsActive,
            @DriverClass,
            @DriverImportPath,
            @APIName,
            @SpeedRank,
            @CostRank,
            @ModelSelectionInsights,
            @InputTokenLimit,
            @SupportedResponseFormats
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModel] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModel] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: spUpdateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModel]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @Vendor nvarchar(50),
    @AIModelTypeID uniqueidentifier,
    @PowerRank int,
    @IsActive bit,
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @SpeedRank int,
    @CostRank int,
    @ModelSelectionInsights nvarchar(MAX),
    @InputTokenLimit int,
    @SupportedResponseFormats nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModel]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Vendor] = @Vendor,
        [AIModelTypeID] = @AIModelTypeID,
        [PowerRank] = @PowerRank,
        [IsActive] = @IsActive,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [APIName] = @APIName,
        [SpeedRank] = @SpeedRank,
        [CostRank] = @CostRank,
        [ModelSelectionInsights] = @ModelSelectionInsights,
        [InputTokenLimit] = @InputTokenLimit,
        [SupportedResponseFormats] = @SupportedResponseFormats
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the AIModel table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModel
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModel
ON [${flyway:defaultSchema}].[AIModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModel]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModel] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Models
-- Item: spDeleteAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModel]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModel] TO [cdp_Developer]
    

/* spDelete Permissions for AI Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModel] TO [cdp_Developer]



/* Index for Foreign Keys for DatasetItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dataset Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DatasetID in table DatasetItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DatasetItem_DatasetID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DatasetItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DatasetItem_DatasetID ON [${flyway:defaultSchema}].[DatasetItem] ([DatasetID]);

-- Index for foreign key EntityID in table DatasetItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DatasetItem_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DatasetItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DatasetItem_EntityID ON [${flyway:defaultSchema}].[DatasetItem] ([EntityID]);

/* Base View SQL for Dataset Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dataset Items
-- Item: vwDatasetItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dataset Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DatasetItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDatasetItems]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDatasetItems]
AS
SELECT
    d.*,
    Dataset_DatasetID.[Name] AS [Dataset],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[DatasetItem] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Dataset] AS Dataset_DatasetID
  ON
    [d].[DatasetID] = Dataset_DatasetID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [d].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDatasetItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Dataset Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dataset Items
-- Item: Permissions for vwDatasetItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDatasetItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spDelete SQL for Dataset Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dataset Items
-- Item: spDeleteDatasetItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DatasetItem
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDatasetItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDatasetItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DatasetItem]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for Dataset Items */




/* Index for Foreign Keys for RecordMergeLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table RecordMergeLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordMergeLog_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordMergeLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordMergeLog_EntityID ON [${flyway:defaultSchema}].[RecordMergeLog] ([EntityID]);

-- Index for foreign key InitiatedByUserID in table RecordMergeLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordMergeLog_InitiatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordMergeLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordMergeLog_InitiatedByUserID ON [${flyway:defaultSchema}].[RecordMergeLog] ([InitiatedByUserID]);

-- Index for foreign key ApprovedByUserID in table RecordMergeLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordMergeLog_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordMergeLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordMergeLog_ApprovedByUserID ON [${flyway:defaultSchema}].[RecordMergeLog] ([ApprovedByUserID]);

/* Base View SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: vwRecordMergeLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Record Merge Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordMergeLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwRecordMergeLogs]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordMergeLogs]
AS
SELECT
    r.*,
    Entity_EntityID.[Name] AS [Entity],
    User_InitiatedByUserID.[Name] AS [InitiatedByUser],
    User_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[RecordMergeLog] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_InitiatedByUserID
  ON
    [r].[InitiatedByUserID] = User_InitiatedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_ApprovedByUserID
  ON
    [r].[ApprovedByUserID] = User_ApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordMergeLogs] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: Permissions for vwRecordMergeLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordMergeLogs] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: spCreateRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateRecordMergeLog]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordMergeLog]
    @EntityID uniqueidentifier,
    @SurvivingRecordID nvarchar(450),
    @InitiatedByUserID uniqueidentifier,
    @ApprovalStatus nvarchar(10),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(10),
    @ProcessingStartedAt datetime,
    @ProcessingEndedAt datetime,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[RecordMergeLog]
        (
            [EntityID],
            [SurvivingRecordID],
            [InitiatedByUserID],
            [ApprovalStatus],
            [ApprovedByUserID],
            [ProcessingStatus],
            [ProcessingStartedAt],
            [ProcessingEndedAt],
            [ProcessingLog],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @SurvivingRecordID,
            @InitiatedByUserID,
            @ApprovalStatus,
            @ApprovedByUserID,
            @ProcessingStatus,
            @ProcessingStartedAt,
            @ProcessingEndedAt,
            @ProcessingLog,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordMergeLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Record Merge Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Record Merge Logs
-- Item: spUpdateRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateRecordMergeLog]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordMergeLog]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @SurvivingRecordID nvarchar(450),
    @InitiatedByUserID uniqueidentifier,
    @ApprovalStatus nvarchar(10),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(10),
    @ProcessingStartedAt datetime,
    @ProcessingEndedAt datetime,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordMergeLog]
    SET
        [EntityID] = @EntityID,
        [SurvivingRecordID] = @SurvivingRecordID,
        [InitiatedByUserID] = @InitiatedByUserID,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingStartedAt] = @ProcessingStartedAt,
        [ProcessingEndedAt] = @ProcessingEndedAt,
        [ProcessingLog] = @ProcessingLog,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordMergeLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the RecordMergeLog table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateRecordMergeLog
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordMergeLog
ON [${flyway:defaultSchema}].[RecordMergeLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordMergeLog]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordMergeLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Record Merge Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordMergeLog] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for QueryPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueryID in table QueryPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryPermission_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryPermission_QueryID ON [${flyway:defaultSchema}].[QueryPermission] ([QueryID]);

-- Index for foreign key RoleID in table QueryPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryPermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryPermission_RoleID ON [${flyway:defaultSchema}].[QueryPermission] ([RoleID]);

/* Base View SQL for Query Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Permissions
-- Item: vwQueryPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Query Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwQueryPermissions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryPermissions]
AS
SELECT
    q.*,
    Query_QueryID.[Name] AS [Query],
    Role_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[QueryPermission] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS Query_QueryID
  ON
    [q].[QueryID] = Query_QueryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS Role_RoleID
  ON
    [q].[RoleID] = Role_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Query Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Permissions
-- Item: Permissions for vwQueryPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Query Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Permissions
-- Item: spCreateQueryPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateQueryPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryPermission]
    @QueryID uniqueidentifier,
    @RoleID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[QueryPermission]
        (
            [QueryID],
            [RoleID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @QueryID,
            @RoleID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Query Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Query Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Permissions
-- Item: spUpdateQueryPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateQueryPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryPermission]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @RoleID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryPermission]
    SET
        [QueryID] = @QueryID,
        [RoleID] = @RoleID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the QueryPermission table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateQueryPermission
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryPermission
ON [${flyway:defaultSchema}].[QueryPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryPermission]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Query Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Query Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Query Permissions
-- Item: spDeleteQueryPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryPermission
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteQueryPermission]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueryPermission]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryPermission] TO [cdp_Integration]
    

/* spDelete Permissions for Query Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryPermission] TO [cdp_Integration]



/* Index for Foreign Keys for EntityRecordDocument */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRecordDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRecordDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityID ON [${flyway:defaultSchema}].[EntityRecordDocument] ([EntityID]);

-- Index for foreign key EntityDocumentID in table EntityRecordDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRecordDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRecordDocument_EntityDocumentID ON [${flyway:defaultSchema}].[EntityRecordDocument] ([EntityDocumentID]);

-- Index for foreign key VectorIndexID in table EntityRecordDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRecordDocument_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRecordDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRecordDocument_VectorIndexID ON [${flyway:defaultSchema}].[EntityRecordDocument] ([VectorIndexID]);

/* Base View SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: vwEntityRecordDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Entity Record Documents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityRecordDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwEntityRecordDocuments]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityRecordDocuments]
AS
SELECT
    e.*,
    Entity_EntityID.[Name] AS [Entity],
    EntityDocument_EntityDocumentID.[Name] AS [EntityDocument],
    VectorIndex_VectorIndexID.[Name] AS [VectorIndex]
FROM
    [${flyway:defaultSchema}].[EntityRecordDocument] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS EntityDocument_EntityDocumentID
  ON
    [e].[EntityDocumentID] = EntityDocument_EntityDocumentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS VectorIndex_VectorIndexID
  ON
    [e].[VectorIndexID] = VectorIndex_VectorIndexID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRecordDocuments] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: Permissions for vwEntityRecordDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRecordDocuments] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: spCreateEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityRecordDocument]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRecordDocument]
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EntityDocumentID uniqueidentifier,
    @DocumentText nvarchar(MAX),
    @VectorIndexID uniqueidentifier,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[EntityRecordDocument]
        (
            [EntityID],
            [RecordID],
            [EntityDocumentID],
            [DocumentText],
            [VectorIndexID],
            [VectorID],
            [VectorJSON],
            [EntityRecordUpdatedAt]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @EntityID,
            @RecordID,
            @EntityDocumentID,
            @DocumentText,
            @VectorIndexID,
            @VectorID,
            @VectorJSON,
            @EntityRecordUpdatedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRecordDocuments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Entity Record Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Record Documents
-- Item: spUpdateEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityRecordDocument]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRecordDocument]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EntityDocumentID uniqueidentifier,
    @DocumentText nvarchar(MAX),
    @VectorIndexID uniqueidentifier,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRecordDocument]
    SET
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [EntityDocumentID] = @EntityDocumentID,
        [DocumentText] = @DocumentText,
        [VectorIndexID] = @VectorIndexID,
        [VectorID] = @VectorID,
        [VectorJSON] = @VectorJSON,
        [EntityRecordUpdatedAt] = @EntityRecordUpdatedAt
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRecordDocuments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the EntityRecordDocument table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityRecordDocument
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRecordDocument
ON [${flyway:defaultSchema}].[EntityRecordDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRecordDocument]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRecordDocument] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Record Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for EntityDocument */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Documents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TypeID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_TypeID ON [${flyway:defaultSchema}].[EntityDocument] ([TypeID]);

-- Index for foreign key EntityID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_EntityID ON [${flyway:defaultSchema}].[EntityDocument] ([EntityID]);

-- Index for foreign key VectorDatabaseID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_VectorDatabaseID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_VectorDatabaseID ON [${flyway:defaultSchema}].[EntityDocument] ([VectorDatabaseID]);

-- Index for foreign key TemplateID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_TemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_TemplateID ON [${flyway:defaultSchema}].[EntityDocument] ([TemplateID]);

-- Index for foreign key AIModelID in table EntityDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityDocument_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityDocument_AIModelID ON [${flyway:defaultSchema}].[EntityDocument] ([AIModelID]);

/* Index for Foreign Keys for UserViewCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table UserViewCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewCategory_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewCategory_ParentID ON [${flyway:defaultSchema}].[UserViewCategory] ([ParentID]);

-- Index for foreign key EntityID in table UserViewCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewCategory_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewCategory_EntityID ON [${flyway:defaultSchema}].[UserViewCategory] ([EntityID]);

-- Index for foreign key UserID in table UserViewCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewCategory_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewCategory_UserID ON [${flyway:defaultSchema}].[UserViewCategory] ([UserID]);

/* Base View SQL for Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Documents
-- Item: vwEntityDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Entity Documents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwEntityDocuments]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityDocuments]
AS
SELECT
    e.*,
    EntityDocumentType_TypeID.[Name] AS [Type],
    Entity_EntityID.[Name] AS [Entity],
    VectorDatabase_VectorDatabaseID.[Name] AS [VectorDatabase],
    Template_TemplateID.[Name] AS [Template],
    AIModel_AIModelID.[Name] AS [AIModel]
FROM
    [${flyway:defaultSchema}].[EntityDocument] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EntityDocumentType] AS EntityDocumentType_TypeID
  ON
    [e].[TypeID] = EntityDocumentType_TypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [e].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[VectorDatabase] AS VectorDatabase_VectorDatabaseID
  ON
    [e].[VectorDatabaseID] = VectorDatabase_VectorDatabaseID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_TemplateID
  ON
    [e].[TemplateID] = Template_TemplateID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_AIModelID
  ON
    [e].[AIModelID] = AIModel_AIModelID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityDocuments] TO [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Documents
-- Item: Permissions for vwEntityDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityDocuments] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Documents
-- Item: spCreateEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityDocument
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityDocument]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityDocument]
    @Name nvarchar(250),
    @TypeID uniqueidentifier,
    @EntityID uniqueidentifier,
    @VectorDatabaseID uniqueidentifier,
    @Status nvarchar(15),
    @TemplateID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @PotentialMatchThreshold numeric(12, 11),
    @AbsoluteMatchThreshold numeric(12, 11)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[EntityDocument]
        (
            [Name],
            [TypeID],
            [EntityID],
            [VectorDatabaseID],
            [Status],
            [TemplateID],
            [AIModelID],
            [PotentialMatchThreshold],
            [AbsoluteMatchThreshold]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @TypeID,
            @EntityID,
            @VectorDatabaseID,
            @Status,
            @TemplateID,
            @AIModelID,
            @PotentialMatchThreshold,
            @AbsoluteMatchThreshold
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityDocuments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityDocument] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityDocument] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Documents
-- Item: spUpdateEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityDocument
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityDocument]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityDocument]
    @ID uniqueidentifier,
    @Name nvarchar(250),
    @TypeID uniqueidentifier,
    @EntityID uniqueidentifier,
    @VectorDatabaseID uniqueidentifier,
    @Status nvarchar(15),
    @TemplateID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @PotentialMatchThreshold numeric(12, 11),
    @AbsoluteMatchThreshold numeric(12, 11)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityDocument]
    SET
        [Name] = @Name,
        [TypeID] = @TypeID,
        [EntityID] = @EntityID,
        [VectorDatabaseID] = @VectorDatabaseID,
        [Status] = @Status,
        [TemplateID] = @TemplateID,
        [AIModelID] = @AIModelID,
        [PotentialMatchThreshold] = @PotentialMatchThreshold,
        [AbsoluteMatchThreshold] = @AbsoluteMatchThreshold
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityDocuments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityDocument] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the EntityDocument table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityDocument
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityDocument
ON [${flyway:defaultSchema}].[EntityDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityDocument]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityDocument] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityDocument] TO [cdp_Integration], [cdp_Developer]



/* Base View SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: vwUserViewCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      User View Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserViewCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwUserViewCategories]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserViewCategories]
AS
SELECT
    u.*,
    UserViewCategory_ParentID.[Name] AS [Parent],
    Entity_EntityID.[Name] AS [Entity],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[UserViewCategory] AS u
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserViewCategory] AS UserViewCategory_ParentID
  ON
    [u].[ParentID] = UserViewCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [u].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: Permissions for vwUserViewCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: spCreateUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserViewCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateUserViewCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[UserViewCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [EntityID],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @EntityID,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViewCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for User View Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: spUpdateUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserViewCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateUserViewCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [EntityID] = @EntityID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViewCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the UserViewCategory table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateUserViewCategory
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserViewCategory
ON [${flyway:defaultSchema}].[UserViewCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewCategory]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserViewCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User View Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User View Categories
-- Item: spDeleteUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserViewCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteUserViewCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserViewCategory]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for User View Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for ApplicationSetting */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Application Settings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table ApplicationSetting
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ApplicationSetting_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ApplicationSetting]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ApplicationSetting_ApplicationID ON [${flyway:defaultSchema}].[ApplicationSetting] ([ApplicationID]);

/* Base View SQL for Application Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Application Settings
-- Item: vwApplicationSettings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Application Settings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ApplicationSetting
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwApplicationSettings]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwApplicationSettings]
AS
SELECT
    a.*,
    Application_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[ApplicationSetting] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Application] AS Application_ApplicationID
  ON
    [a].[ApplicationID] = Application_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwApplicationSettings] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Application Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Application Settings
-- Item: Permissions for vwApplicationSettings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwApplicationSettings] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Application Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Application Settings
-- Item: spCreateApplicationSetting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ApplicationSetting
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateApplicationSetting]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateApplicationSetting]
    @ApplicationID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ApplicationSetting]
        (
            [ApplicationID],
            [Name],
            [Value],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ApplicationID,
            @Name,
            @Value,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwApplicationSettings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplicationSetting] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Application Settings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplicationSetting] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Application Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Application Settings
-- Item: spUpdateApplicationSetting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ApplicationSetting
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateApplicationSetting]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateApplicationSetting]
    @ID uniqueidentifier,
    @ApplicationID uniqueidentifier,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ApplicationSetting]
    SET
        [ApplicationID] = @ApplicationID,
        [Name] = @Name,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwApplicationSettings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplicationSetting] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ApplicationSetting table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateApplicationSetting
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateApplicationSetting
ON [${flyway:defaultSchema}].[ApplicationSetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ApplicationSetting]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ApplicationSetting] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Application Settings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplicationSetting] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Application Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Application Settings
-- Item: spDeleteApplicationSetting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationSetting
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteApplicationSetting]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplicationSetting]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ApplicationSetting]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplicationSetting] TO [cdp_Integration]
    

/* spDelete Permissions for Application Settings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplicationSetting] TO [cdp_Integration]



/* Index for Foreign Keys for ActionAuthorization */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Authorizations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActionID in table ActionAuthorization
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionAuthorization_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionAuthorization]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionAuthorization_ActionID ON [${flyway:defaultSchema}].[ActionAuthorization] ([ActionID]);

-- Index for foreign key AuthorizationID in table ActionAuthorization
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionAuthorization_AuthorizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionAuthorization]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionAuthorization_AuthorizationID ON [${flyway:defaultSchema}].[ActionAuthorization] ([AuthorizationID]);

/* Base View SQL for Action Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Authorizations
-- Item: vwActionAuthorizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Action Authorizations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ActionAuthorization
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwActionAuthorizations]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActionAuthorizations]
AS
SELECT
    a.*,
    Action_ActionID.[Name] AS [Action],
    Authorization_AuthorizationID.[Name] AS [Authorization]
FROM
    [${flyway:defaultSchema}].[ActionAuthorization] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Authorization] AS Authorization_AuthorizationID
  ON
    [a].[AuthorizationID] = Authorization_AuthorizationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActionAuthorizations] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for Action Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Authorizations
-- Item: Permissions for vwActionAuthorizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActionAuthorizations] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Action Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Authorizations
-- Item: spCreateActionAuthorization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionAuthorization
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateActionAuthorization]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateActionAuthorization]
    @ActionID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ActionAuthorization]
        (
            [ActionID],
            [AuthorizationID],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ActionID,
            @AuthorizationID,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActionAuthorizations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionAuthorization] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Action Authorizations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionAuthorization] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Action Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Authorizations
-- Item: spUpdateActionAuthorization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionAuthorization
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateActionAuthorization]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateActionAuthorization]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier,
    @AuthorizationID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionAuthorization]
    SET
        [ActionID] = @ActionID,
        [AuthorizationID] = @AuthorizationID,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActionAuthorizations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionAuthorization] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ActionAuthorization table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateActionAuthorization
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateActionAuthorization
ON [${flyway:defaultSchema}].[ActionAuthorization]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionAuthorization]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ActionAuthorization] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Action Authorizations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionAuthorization] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Action Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Authorizations
-- Item: spDeleteActionAuthorization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionAuthorization
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteActionAuthorization]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteActionAuthorization]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ActionAuthorization]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionAuthorization] TO [cdp_Integration]
    

/* spDelete Permissions for Action Authorizations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionAuthorization] TO [cdp_Integration]



/* Index for Foreign Keys for ListCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table ListCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ListCategory_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ListCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ListCategory_ParentID ON [${flyway:defaultSchema}].[ListCategory] ([ParentID]);

-- Index for foreign key UserID in table ListCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ListCategory_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ListCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ListCategory_UserID ON [${flyway:defaultSchema}].[ListCategory] ([UserID]);

/* Base View SQL for List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Categories
-- Item: vwListCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      List Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ListCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwListCategories]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwListCategories]
AS
SELECT
    l.*,
    ListCategory_ParentID.[Name] AS [Parent],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ListCategory] AS l
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ListCategory] AS ListCategory_ParentID
  ON
    [l].[ParentID] = ListCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [l].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwListCategories] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Categories
-- Item: Permissions for vwListCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwListCategories] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Categories
-- Item: spCreateListCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ListCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateListCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateListCategory]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ListCategory]
        (
            [Name],
            [Description],
            [ParentID],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @ParentID,
            @UserID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwListCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for List Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Categories
-- Item: spUpdateListCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ListCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateListCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateListCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwListCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ListCategory table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateListCategory
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateListCategory
ON [${flyway:defaultSchema}].[ListCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListCategory]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ListCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for List Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: List Categories
-- Item: spDeleteListCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteListCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteListCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ListCategory]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListCategory] TO [cdp_Integration]
    

/* spDelete Permissions for List Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListCategory] TO [cdp_Integration]



/* Index for Foreign Keys for ContentSource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentTypeID]);

-- Index for foreign key ContentSourceTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentSourceTypeID]);

-- Index for foreign key ContentFileTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentFileTypeID]);

/* Base View SQL for Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Sources
-- Item: vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Content Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentSources]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSources]
AS
SELECT
    c.*,
    ContentType_ContentTypeID.[Name] AS [ContentType],
    ContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType],
    ContentFileType_ContentFileTypeID.[Name] AS [ContentFileType]
FROM
    [${flyway:defaultSchema}].[ContentSource] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentType] AS ContentType_ContentTypeID
  ON
    [c].[ContentTypeID] = ContentType_ContentTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS ContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = ContentSourceType_ContentSourceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentFileType] AS ContentFileType_ContentFileTypeID
  ON
    [c].[ContentFileTypeID] = ContentFileType_ContentFileTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Sources
-- Item: spCreateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSource
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentSource]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource]
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ContentSource]
        (
            [Name],
            [ContentTypeID],
            [ContentSourceTypeID],
            [ContentFileTypeID],
            [URL]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @ContentTypeID,
            @ContentSourceTypeID,
            @ContentFileTypeID,
            @URL
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Sources
-- Item: spUpdateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentSource]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        [Name] = @Name,
        [ContentTypeID] = @ContentTypeID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [ContentFileTypeID] = @ContentFileTypeID,
        [URL] = @URL
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentSources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ContentSource table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentSource
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSource
ON [${flyway:defaultSchema}].[ContentSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentSource]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSource]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Integration]
    

/* spDelete Permissions for Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Integration]



/* Index for Foreign Keys for ContentItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentSourceID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceID ON [${flyway:defaultSchema}].[ContentItem] ([ContentSourceID]);

-- Index for foreign key ContentTypeID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentTypeID ON [${flyway:defaultSchema}].[ContentItem] ([ContentTypeID]);

-- Index for foreign key ContentSourceTypeID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentItem] ([ContentSourceTypeID]);

-- Index for foreign key ContentFileTypeID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentFileTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentFileTypeID ON [${flyway:defaultSchema}].[ContentItem] ([ContentFileTypeID]);

/* Base View SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Content Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentItems]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItems]
AS
SELECT
    c.*,
    ContentSource_ContentSourceID.[Name] AS [ContentSource],
    ContentType_ContentTypeID.[Name] AS [ContentType],
    ContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType],
    ContentFileType_ContentFileTypeID.[Name] AS [ContentFileType]
FROM
    [${flyway:defaultSchema}].[ContentItem] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS ContentSource_ContentSourceID
  ON
    [c].[ContentSourceID] = ContentSource_ContentSourceID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentType] AS ContentType_ContentTypeID
  ON
    [c].[ContentTypeID] = ContentType_ContentTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS ContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = ContentSourceType_ContentSourceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentFileType] AS ContentFileType_ContentFileTypeID
  ON
    [c].[ContentFileTypeID] = ContentFileType_ContentFileTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: Permissions for vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: spCreateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItem
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateContentItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItem]
    @ContentSourceID uniqueidentifier,
    @Name nvarchar(250),
    @Description nvarchar(MAX),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @Checksum nvarchar(100),
    @URL nvarchar(2000),
    @Text nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[ContentItem]
        (
            [ContentSourceID],
            [Name],
            [Description],
            [ContentTypeID],
            [ContentSourceTypeID],
            [ContentFileTypeID],
            [Checksum],
            [URL],
            [Text]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ContentSourceID,
            @Name,
            @Description,
            @ContentTypeID,
            @ContentSourceTypeID,
            @ContentFileTypeID,
            @Checksum,
            @URL,
            @Text
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Content Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: spUpdateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItem
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateContentItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItem]
    @ID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @Name nvarchar(250),
    @Description nvarchar(MAX),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @Checksum nvarchar(100),
    @URL nvarchar(2000),
    @Text nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItem]
    SET
        [ContentSourceID] = @ContentSourceID,
        [Name] = @Name,
        [Description] = @Description,
        [ContentTypeID] = @ContentTypeID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [ContentFileTypeID] = @ContentFileTypeID,
        [Checksum] = @Checksum,
        [URL] = @URL,
        [Text] = @Text
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the ContentItem table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateContentItem
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItem
ON [${flyway:defaultSchema}].[ContentItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItem]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Content Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Content Items
-- Item: spDeleteContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItem
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteContentItem]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItem]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] TO [cdp_Integration]
    

/* spDelete Permissions for Content Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] TO [cdp_Integration]



