/* SQL text to update display name for field SQLName */
UPDATE [${flyway:defaultSchema}].EntityField SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'SQL Name' WHERE ID = 'D94217F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to update display name for field URLFormat */
UPDATE [${flyway:defaultSchema}].EntityField SET __mj_UpdatedAt=GETUTCDATE(), DisplayName = 'URL Format' WHERE ID = '0C5817F0-6F36-EF11-86D4-6045BDEE16E6'

/* SQL text to delete entity field value ID 2B28453E-F36B-1410-8680-007B559E242F */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='2B28453E-F36B-1410-8680-007B559E242F'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '89637d00-a339-4085-90a7-945d475f085e'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'MCPServerTool')
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
            '89637d00-a339-4085-90a7-945d475f085e',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100019,
            'MCPServerTool',
            'MCP Server Tool',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '119342e4-c4cf-419a-bef9-7ae4a9fb1c89'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PromptRun')
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
            '119342e4-c4cf-419a-bef9-7ae4a9fb1c89',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            100041,
            'PromptRun',
            'Prompt Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '20224d0b-b92e-4d0f-a2b4-121ca5761d55'  OR 
               (EntityID = 'D7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            '20224d0b-b92e-4d0f-a2b4-121ca5761d55',
            'D7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Company Integrations
            100016,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '252c5ec5-6fbb-48c0-a3ac-ea3fad3a612c'  OR 
               (EntityID = 'D8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            '252c5ec5-6fbb-48c0-a3ac-ea3fad3a612c',
            'D8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Roles
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b027296b-4c0c-49af-b8ec-7039ace36483'  OR 
               (EntityID = 'D9238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            'b027296b-4c0c-49af-b8ec-7039ace36483',
            'D9238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Skills
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fd49b177-9a8f-4647-88a1-3e36dabd298e'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRun')
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
            'fd49b177-9a8f-4647-88a1-3e36dabd298e',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100023,
            'CompanyIntegrationRun',
            'Company Integration Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '51f3ad26-926a-4842-b2d6-70c6b1ce49c4'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRunDetail')
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
            '51f3ad26-926a-4842-b2d6-70c6b1ce49c4',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100024,
            'CompanyIntegrationRunDetail',
            'Company Integration Run Detail',
            NULL,
            'nvarchar',
            900,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'dd6af4d2-e8c1-4143-95e2-1057faad7cb1'  OR 
               (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ReplayRun')
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
            'dd6af4d2-e8c1-4143-95e2-1057faad7cb1',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Changes
            100040,
            'ReplayRun',
            'Replay Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '831702de-7a39-450f-91e2-e00457be68b6'  OR 
               (EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ConversationDetail')
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
            '831702de-7a39-450f-91e2-e00457be68b6',
            '09248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Reports
            100053,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '79504dda-fdcc-4bdb-ac87-7c7f4402fa69'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TestRun')
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
            '79504dda-fdcc-4bdb-ac87-7c7f4402fa69',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100045,
            'TestRun',
            'Test Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e160d2ec-61c8-478b-ada4-a984c2fe8f15'  OR 
               (EntityID = '18248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecordMergeLog')
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
            'e160d2ec-61c8-478b-ada4-a984c2fe8f15',
            '18248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Merge Deletion Logs
            100015,
            'RecordMergeLog',
            'Record Merge Log',
            NULL,
            'nvarchar',
            900,
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
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '89910592-5f42-4e7f-92b5-7bbfa5889eeb'  OR 
               (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DuplicateRun')
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
            '89910592-5f42-4e7f-92b5-7bbfa5889eeb',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Duplicate Run Details
            100021,
            'DuplicateRun',
            'Duplicate Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'eb6a5737-67aa-4df1-99c5-c9a8dd794843'  OR 
               (EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            'eb6a5737-67aa-4df1-99c5-c9a8dd794843',
            '35248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Invocations
            100014,
            'EntityAction',
            'Entity Action',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3a310a87-bb27-42ab-a549-3152e8b11aa4'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '3a310a87-bb27-42ab-a549-3152e8b11aa4',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100015,
            'EntityAction',
            'Entity Action',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '17cc54d5-0008-4ca4-bb11-e17764363743'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ActionFilter')
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
            '17cc54d5-0008-4ca4-bb11-e17764363743',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100016,
            'ActionFilter',
            'Action Filter',
            NULL,
            'nvarchar',
            -1,
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
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '97d37242-96dd-47f7-9a1f-af1a62efd86d'  OR 
               (EntityID = '4B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TemplateContent')
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
            '97d37242-96dd-47f7-9a1f-af1a62efd86d',
            '4B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Template Params
            100037,
            'TemplateContent',
            'Template Content',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9faf0423-6e8d-4431-97ac-9f36d215077a'  OR 
               (EntityID = '4D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecommendationRun')
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
            '9faf0423-6e8d-4431-97ac-9f36d215077a',
            '4D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendations
            100014,
            'RecommendationRun',
            'Recommendation Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5bbc2543-e138-401d-9be4-504c0fa81292'  OR 
               (EntityID = '50248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Recommendation')
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
            '5bbc2543-e138-401d-9be4-504c0fa81292',
            '50248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendation Items
            100016,
            'Recommendation',
            'Recommendation',
            NULL,
            'nvarchar',
            -1,
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
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '046d9d0b-757a-49f1-9a6e-529c4cf47ff3'  OR 
               (EntityID = '52248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityCommunicationMessageType')
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
            '046d9d0b-757a-49f1-9a6e-529c4cf47ff3',
            '52248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Communication Fields
            100013,
            'EntityCommunicationMessageType',
            'Entity Communication Message Type',
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
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b2a294f0-df1c-42af-86bf-ba19ab5e6011'  OR 
               (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            'b2a294f0-df1c-42af-86bf-ba19ab5e6011',
            '56248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Params
            100018,
            'EntityAction',
            'Entity Action',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '47dfd355-d9e4-45b7-9140-c0c85830a7f2'  OR 
               (EntityID = 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E' AND Name = 'ConversationDetail')
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
            '47dfd355-d9e4-45b7-9140-c0c85830a7f2',
            'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E', -- Entity: MJ: Conversation Detail Ratings
            100016,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '88facae0-756c-4e96-8116-6a9315bd804a'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'AgentRun')
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
            '88facae0-756c-4e96-8116-6a9315bd804a',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100046,
            'AgentRun',
            'Agent Run',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ee2fb878-75a5-49dd-8f50-f59e3425fb96'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'Parent')
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
            'ee2fb878-75a5-49dd-8f50-f59e3425fb96',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100047,
            'Parent',
            'Parent',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c290302b-0c53-45d2-9494-31d3a6a15239'  OR 
               (EntityID = '16AB21D1-8047-41B9-8AEA-CD253DED9743' AND Name = 'ConversationDetail')
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
            'c290302b-0c53-45d2-9494-31d3a6a15239',
            '16AB21D1-8047-41B9-8AEA-CD253DED9743', -- Entity: MJ: Conversation Detail Artifacts
            100014,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '760c4d35-6513-4d61-b739-a3c856ad9911'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ConversationDetail')
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
            '760c4d35-6513-4d61-b739-a3c856ad9911',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100046,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0eaf3883-4999-4a88-bf17-53392cae9dfc'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'MCPServerTool')
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
            '0eaf3883-4999-4a88-bf17-53392cae9dfc',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100034,
            'MCPServerTool',
            'MCP Server Tool',
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '20224D0B-B92E-4D0F-A2B4-121CA5761D55'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C94D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '20224D0B-B92E-4D0F-A2B4-121CA5761D55'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '50A4214B-56C2-4B72-8544-1D86CBBB329F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '20224D0B-B92E-4D0F-A2B4-121CA5761D55'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '50A4214B-56C2-4B72-8544-1D86CBBB329F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '252C5EC5-6FBB-48C0-A3AC-EA3FAD3A612C'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '252C5EC5-6FBB-48C0-A3AC-EA3FAD3A612C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '252C5EC5-6FBB-48C0-A3AC-EA3FAD3A612C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '89910592-5F42-4E7F-92B5-7BBFA5889EEB'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '89910592-5F42-4E7F-92B5-7BBFA5889EEB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD73433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0074433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9B74433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE73433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0074433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9B74433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '750A856A-8E2A-4161-AE35-0A311266D2EA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0B216DCA-0EB9-42E3-942F-8C74960C2CD5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '48C4211A-CF59-45BE-B2F1-EF59FD5D2050'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '575753A4-C12E-4E48-A835-6FE3FACE5527'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '114E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '824E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '575753A4-C12E-4E48-A835-6FE3FACE5527'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '49A2D31E-331D-42C6-BA30-C96EB5A1310F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE95FC8E-8A64-48D1-AA72-2F141C9199A2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '354417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duplicate Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '364417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duplicate Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '89910592-5F42-4E7F-92B5-7BBFA5889EEB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skipped Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Merge Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Merge Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '835817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '845817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '50A4214B-56C2-4B72-8544-1D86CBBB329F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External Identifier',
       GeneratedFormSection = 'Category',
       DisplayName = 'External System Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External Identifier',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C94D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External Identifier',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '20224D0B-B92E-4D0F-A2B4-121CA5761D55'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A05817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A15817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '014D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '024D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Employee Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '252C5EC5-6FBB-48C0-A3AC-EA3FAD3A612C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Role Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

            UPDATE [${flyway:defaultSchema}].EntitySetting
            SET Value = '{"Employee Info":{"icon":"fa fa-id-card","description":"Details about the employee such as name or descriptive information"}}', __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'D8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
         

/* Update FieldCategoryIcons setting (legacy) */

            UPDATE [${flyway:defaultSchema}].EntitySetting
            SET Value = '{"Employee Info":"fa fa-id-card"}', __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'D8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
         

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Result Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0074433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expired On',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0174433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0774433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D74433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F332D3A9-5402-4E82-90E4-DDB3F4315F19'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '257026B1-1FD2-4B71-B94D-F97E7FEE6023'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D991B48-52BD-4609-B8C1-71529BF8E9E8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Embedding',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C20C752B-8050-44A3-BC08-C1E85E1A9231'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1BF0DAAD-4F43-4486-AF6A-787A9DD73684'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B74433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '750A856A-8E2A-4161-AE35-0A311266D2EA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B216DCA-0EB9-42E3-942F-8C74960C2CD5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48C4211A-CF59-45BE-B2F1-EF59FD5D2050'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '119342E4-C4CF-419A-BEF9-7AE4A9FB1C89'
   AND AutoUpdateCategory = 1

/* Set categories for 23 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0F4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '104E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'External ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '114E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Archived',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '144417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '814E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '824E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '575753A4-C12E-4E48-A835-6FE3FACE5527'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A8EE672F-D2DF-4C0F-81FC-1392FCAD9813'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB07B3D0-FF8B-43AD-A612-01340C796652'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pinned',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7CAD1EDB-FDFC-4C19-8E8C-CCBCE0C60558'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Run Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E687A08-D39E-4488-9AF9-C71394F7217A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '834E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1AE26D76-2246-4FD4-8BCB-04C1953E2612'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '49A2D31E-331D-42C6-BA30-C96EB5A1310F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE95FC8E-8A64-48D1-AA72-2F141C9199A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Run Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79504DDA-FDCC-4BDB-AC87-7C7F4402FA69'
   AND AutoUpdateCategory = 1

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3A310A87-BB27-42AB-A549-3152E8B11AA4'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5D5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3A310A87-BB27-42AB-A549-3152E8B11AA4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '17CC54D5-0008-4CA4-BB11-E17764363743'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3A310A87-BB27-42AB-A549-3152E8B11AA4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '17CC54D5-0008-4CA4-BB11-E17764363743'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B05717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '046D9D0B-757A-49F1-9A6E-529C4CF47FF3'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '046D9D0B-757A-49F1-9A6E-529C4CF47FF3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'EB6A5737-67AA-4DF1-99C5-C9A8DD794843'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EB6A5737-67AA-4DF1-99C5-C9A8DD794843'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EB6A5737-67AA-4DF1-99C5-C9A8DD794843'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '995817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B2A294F0-DF1C-42AF-86BF-BA19AB5E6011'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9B5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B2A294F0-DF1C-42AF-86BF-BA19AB5E6011'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B027296B-4C0C-49AF-B8EC-7039ACE36483'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B027296B-4C0C-49AF-B8EC-7039ACE36483'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Filter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5D5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Action Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A310A87-BB27-42AB-A549-3152E8B11AA4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Action Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Filter Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '17CC54D5-0008-4CA4-BB11-E17764363743'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

            UPDATE [${flyway:defaultSchema}].EntitySetting
            SET Value = '{"Action Details":{"icon":"fa fa-filter","description":"Names and definitions of the entity action and its associated filter"}}', __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
         

/* Update FieldCategoryIcons setting (legacy) */

            UPDATE [${flyway:defaultSchema}].EntitySetting
            SET Value = '{"Action Details":"fa fa-filter"}', __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
         

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Type ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '046D9D0B-757A-49F1-9A6E-529C4CF47FF3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Field Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B05717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E15717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E25717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skill',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '404D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skill',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B027296B-4C0C-49AF-B8EC-7039ACE36483'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '034D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '044D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F95717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action Id',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Parameter Id',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '985817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B2A294F0-DF1C-42AF-86BF-BA19AB5E6011'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '995817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value',
       ExtendedType = 'Code',
       CodeType = 'JavaScript'
   WHERE ID = '9A5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Parameter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Invocation Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7D4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Invocation Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB6A5737-67AA-4DF1-99C5-C9A8DD794843'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D5D4F701-DD24-41F4-B62C-C5EFD4676B92'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '89637D00-A339-4085-90A7-945D475F085E'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '89637D00-A339-4085-90A7-945D475F085E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'C290302B-0C53-45D2-9494-31D3A6A15239'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C290302B-0C53-45D2-9494-31D3A6A15239'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C290302B-0C53-45D2-9494-31D3A6A15239'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '465817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '465817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '47DFD355-D9E4-45B7-9140-C0C85830A7F2'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8D564214-0633-4D21-93D9-18FF2CE1CDFE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '47DFD355-D9E4-45B7-9140-C0C85830A7F2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '47DFD355-D9E4-45B7-9140-C0C85830A7F2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B0E0446-427C-4BF0-8562-5152265CFE1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3DC2DCEC-6F1E-421A-BE51-578F7D2F091E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95E2B969-4F03-4EFE-B519-D6DAC1272C3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B5EE3D38-8573-4170-BEE5-A3EF5D51DD4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '019FFEE0-0763-48E0-9862-D429A4CDAB3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '89637D00-A339-4085-90A7-945D475F085E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Input Values',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B114689E-036B-428F-B179-0B68371CF237'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Calls Per Minute',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D5D4F701-DD24-41F4-B62C-C5EFD4676B92'
   AND AutoUpdateCategory = 1

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6D420001-1FB8-430E-9E2C-027A6BF7D757'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B04A327B-55BF-4914-9DCF-3552A5DD0293'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4B0A5884-5F7C-4668-8DE8-3CBD8790DA28'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DD862060-4FD4-4D09-AB19-8E03AAEFC4E1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '79CABC92-666A-4403-8802-F6B57F9E00DE'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B04A327B-55BF-4914-9DCF-3552A5DD0293'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4B0A5884-5F7C-4668-8DE8-3CBD8790DA28'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6B3AB4D4-9150-499E-B9FF-5AF9454849CB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Reference IDs',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C6C87F9-2BD3-4FAC-BDF6-083AF4B27DC1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Reference IDs',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '28CB2BA0-F1BB-4F94-92C0-C70864CC2572'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Reference IDs',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '560E53BF-3F6E-42A2-B3C6-FF2DBAD2EF1C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rating',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8D564214-0633-4D21-93D9-18FF2CE1CDFE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84845FA8-AF88-48F0-B343-2F27EA892DDC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '47DFD355-D9E4-45B7-9140-C0C85830A7F2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '49C7ADAE-9D03-4347-B477-6DE824021056'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '140CF09F-62A3-4A17-A6B5-A6D75D6EEF8D'
   AND AutoUpdateCategory = 1

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6286C405-7ABB-481E-BD23-F517DE7E8BD3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B46BAD20-46B2-445E-B703-CA74BD6F9C5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C45DA881-7CD4-424E-8855-C259F531E018'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Direction',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DDB7A2FA-6D08-4DC3-B69A-6851901A4F79'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '34B67D3A-FED8-49E7-ABCA-3F34FDC88DC3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C290302B-0C53-45D2-9494-31D3A6A15239'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

            UPDATE [${flyway:defaultSchema}].EntitySetting
            SET Value = '{"Conversation Content":{"icon":"fa fa-align-left","description":"Textual content of the conversation message linked to artifacts"}}', __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '16AB21D1-8047-41B9-8AEA-CD253DED9743' AND Name = 'FieldCategoryInfo'
         

/* Update FieldCategoryIcons setting (legacy) */

            UPDATE [${flyway:defaultSchema}].EntitySetting
            SET Value = '{"Conversation Content":"fa fa-align-left"}', __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '16AB21D1-8047-41B9-8AEA-CD253DED9743' AND Name = 'FieldCategoryIcons'
         

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '435817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '445817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '455817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD49B177-9A8F-4647-88A1-3E36DABD298E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '51F3AD26-926A-4842-B2D6-70C6B1CE49C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Code',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '465817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 25 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73A164F4-CD17-4818-944F-C32FF6AECC6F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6EC40C86-3805-46B5-B13C-8BF4C440B8C9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Number',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D420001-1FB8-430E-9E2C-027A6BF7D757'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B04A327B-55BF-4914-9DCF-3552A5DD0293'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A60234B6-768E-4A9A-B320-19945BE32C96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '221FA3C6-184F-49ED-B679-13ABE9A55FEF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EFDF061E-458A-4510-B5B3-A1508BE9C156'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5CB223A8-487A-4C9F-895D-490CDA610571'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B0A5884-5F7C-4668-8DE8-3CBD8790DA28'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD862060-4FD4-4D09-AB19-8E03AAEFC4E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79CABC92-666A-4403-8802-F6B57F9E00DE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8E36A2B5-3F14-4BDA-942E-C0F771D323D5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84D28564-733D-4CC6-BBA3-0DB947BD2040'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Result',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '885CA658-9A97-4A8D-8726-286F954BF65A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Messages',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ADA3E427-9792-4587-96F6-7ECE2CF854FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C3DCA069-31F0-41CE-9E73-471BD9F6DA4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4BE3997A-2974-482B-B5BA-5017439E6CDA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload At Start',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '93A2C3A5-2773-4DEA-847C-0D1AAD1929AA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload At End',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD7A82BD-C269-434B-9BB4-BBAC6064AF98'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '576FE9EC-53A5-47F3-B194-6F32981B92D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '57DAC94A-8AD5-46A3-979B-E8A3E0A8AD38'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notes & System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B3AB4D4-9150-499E-B9FF-5AF9454849CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notes & System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '88FACAE0-756C-4E96-8116-6A9315BD804A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notes & System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EE2FB878-75A5-49DD-8F50-F59E3425FB96'
   AND AutoUpdateCategory = 1

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8071305E-E1C1-48BF-AE70-E345D6B892EE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '97A0A3EA-5563-4C55-9935-397C26BFD00A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '65ABF2B8-3355-4427-828B-E3082806C557'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9A8AEAF5-9065-4B87-8A63-B04F84E83886'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '65ABF2B8-3355-4427-828B-E3082806C557'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1EFAD61D-3A38-4CEA-86FE-67463E887920'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5BBC2543-E138-401D-9BE4-504C0FA81292'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AC5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5BBC2543-E138-401D-9BE4-504C0FA81292'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '135917F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5BBC2543-E138-401D-9BE4-504C0FA81292'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '135917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9FAF0423-6E8D-4431-97AC-9F36D215077A'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9FAF0423-6E8D-4431-97AC-9F36D215077A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E34C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9FAF0423-6E8D-4431-97AC-9F36D215077A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E34C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1B8A92DB-CFF9-400D-B88F-41131C0480C6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '32ED9C3D-9F06-49EA-8165-4C78C41128F0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0EAF3883-4999-4A88-BF17-53392CAE9DFC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DA4217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DC4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Entity Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E34C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9FAF0423-6E8D-4431-97AC-9F36D215077A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 25 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD227316-95F3-468B-8DB8-AEA5E3A4C431'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B6A3F29-48A9-41B8-8374-214F12A5659C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B5358D5-C6C2-4579-879E-D2BA19D95541'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C866D300-E97C-44E7-8848-F3DA97CE3F77'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8719181-09B2-4C98-86F1-9A7828F46D2B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B80F5CC-B3AD-4C4E-9F64-4C061AC14EC2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E94662C2-69B9-4603-9BFC-279CFD42A222'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CCE153EB-99AC-42DD-9BF7-628C0E121C62'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F585440-DA55-4A2A-A48B-2937A3B24483'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A1E1C7BA-66FA-4BDC-A21A-A27AB8C577C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2344E41B-6F21-419A-B80F-43636478A814'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1EFAD61D-3A38-4CEA-86FE-67463E887920'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '18585DF4-33D0-4CFC-95E4-6674186DCD9C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '760C4D35-6513-4D61-B739-A3C856AD9911'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24940E6C-FC69-40F1-9EA6-D860F38FC93F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Percent Complete',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8071305E-E1C1-48BF-AE70-E345D6B892EE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A8AEAF5-9065-4B87-8A63-B04F84E83886'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '65ABF2B8-3355-4427-828B-E3082806C557'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timeline & Milestones',
       GeneratedFormSection = 'Category',
       DisplayName = 'Due At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '97A0A3EA-5563-4C55-9935-397C26BFD00A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timeline & Milestones',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B267C59C-3370-4EDF-A9D4-106D46A6BBF4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timeline & Milestones',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F09901B1-A4C3-4845-A639-B9730146021A'
   AND AutoUpdateCategory = 1

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A85717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A95717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Destination Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Destination Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Probability',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AC5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5BBC2543-E138-401D-9BE4-504C0FA81292'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Destination Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '135917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '035917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '045917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B26460B-B434-41E8-98D6-6E8973A1998F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F402BB2F-2BDB-458A-BA98-58C95C41FE03'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9BEF8A97-4002-4707-A73C-2A679ACE8F96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '68CB9A34-65C2-4546-ABAE-1A616D5F93A6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B8A92DB-CFF9-400D-B88F-41131C0480C6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '32ED9C3D-9F06-49EA-8165-4C78C41128F0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CEF515F8-77D6-4981-9F31-378ED7BAF0A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Parameters',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C584FB9F-D0A0-48D8-9E0E-DAB449769F44'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F92F2ED5-628E-4222-B66C-F5B4139F3309'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Truncated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B0BE70A8-D2E8-46A6-B746-57528E095F81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '78A09C32-7FE6-408A-862A-71BD7E0042F7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73C2B5A4-9F4F-4195-9794-BCE839DB8B70'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0EAF3883-4999-4A88-BF17-53392CAE9DFC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
   AND AutoUpdateCategory = 1

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F14C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DC4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Replay Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B64D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Replay Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD6AF4D2-E8C1-4143-95E2-1057FAAD7CB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Change Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Changed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F04C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Changes JSON',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B34D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Changes Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Full Record JSON',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B54D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F74D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EAA8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '54D5F848-BE9C-4B4A-8DF0-B53E2EA196E5'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F74D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EAA8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EEA8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EFA8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '54D5F848-BE9C-4B4A-8DF0-B53E2EA196E5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E160D2EC-61C8-478B-ADA4-A984C2FE8F15'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E160D2EC-61C8-478B-ADA4-A984C2FE8F15'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9D5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9B5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D74C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D84C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 30 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '284317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B55817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B65817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F84E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sharing Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Thumbnail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '291EF341-1318-4B86-A9A7-1180CE820609'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '257FFE0E-EC6F-441B-8039-3A17B44FF4FB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '54D5F848-BE9C-4B4A-8DF0-B53E2EA196E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F44D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '524F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F94E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Workflow',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F84D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EAA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EBA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '831702DE-7A39-450F-91E2-E00457BE68B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ECA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Workflow',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F0A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Trigger Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F04D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Format Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F14D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Delivery Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Frequency',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Target Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = 'F74D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Trigger Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EDA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Format Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EEA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Delivery Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EFA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Merge Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Deleted Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processing Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5D4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Merge Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E160D2EC-61C8-478B-ADA4-A984C2FE8F15'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '755817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '765817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 19 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '985717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '995717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template Content ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '58826477-0141-4692-A271-24918F5B9224'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D74C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D84C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '97D37242-96DD-47F7-9A1F-AF1A62EFD86D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Required',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Parameter Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E5917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Parameter Field',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0F5917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Extra Filter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '105917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7321B323-7F8B-4DCD-AE44-01FCE8AAB7EF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '945817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '955817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

