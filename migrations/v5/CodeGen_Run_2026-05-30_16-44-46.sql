/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '538b2994-e837-4d07-b89e-6e38d2b2b180' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'MetadataSource')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '538b2994-e837-4d07-b89e-6e38d2b2b180',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100052,
            'MetadataSource',
            'Metadata Source',
            'Provenance of this IntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Declared',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67d6f7a3-83d6-4f43-89eb-329ef9e0228a' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'CreateAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '67d6f7a3-83d6-4f43-89eb-329ef9e0228a',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100062,
            'CreateAPIPath',
            'Create API Path',
            'HTTP path template for create operations. Generic CRUD in BaseRESTIntegrationConnector substitutes parent IDs into {var} placeholders. NULL means create not supported via metadata-driven path.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '903fce8c-131e-42b3-a083-fa1fe2fd08e8' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'CreateMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '903fce8c-131e-42b3-a083-fa1fe2fd08e8',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100063,
            'CreateMethod',
            'Create Method',
            'HTTP method for create (typically POST). NULL means create not supported via metadata-driven path.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '337e6b36-5174-495f-8c5a-14d406bc9361' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'CreateBodyShape')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '337e6b36-5174-495f-8c5a-14d406bc9361',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100064,
            'CreateBodyShape',
            'Create Body Shape',
            'Request body shape for create: flat (top-level fields), wrapped (under CreateBodyKey), or literal (connector overrides CreateRecord and supplies own body).',
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80669c82-8265-4c45-95a0-dc5c48b03021' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'CreateBodyKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '80669c82-8265-4c45-95a0-dc5c48b03021',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100065,
            'CreateBodyKey',
            'Create Body Key',
            'Wrapper key for create body when CreateBodyShape=wrapped. Example: ''member'' for YourMembership which wraps body as {member:{...}}.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fc96cbff-36b9-4a0b-acb4-43087d6f3d6d' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'CreateIDLocation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fc96cbff-36b9-4a0b-acb4-43087d6f3d6d',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100066,
            'CreateIDLocation',
            'Create ID Location',
            'Where the created record ID is found in the create response: path (URL of returned Location header), body (parsed from JSON response), header (specific named header).',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63b7804b-decd-42d1-97aa-0eafda473472' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'UpdateAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '63b7804b-decd-42d1-97aa-0eafda473472',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100067,
            'UpdateAPIPath',
            'Update API Path',
            'HTTP path template for update operations. Typically contains {ID} placeholder substituted with the record ExternalID at runtime.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b616f27-4cbf-4699-8a1f-b3563dfe04ec' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'UpdateMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5b616f27-4cbf-4699-8a1f-b3563dfe04ec',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100068,
            'UpdateMethod',
            'Update Method',
            'HTTP method for update (typically PATCH or PUT).',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74aab7fa-d6c8-4b76-8e29-3928b76b54e8' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'UpdateBodyShape')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '74aab7fa-d6c8-4b76-8e29-3928b76b54e8',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100069,
            'UpdateBodyShape',
            'Update Body Shape',
            'Request body shape for update: flat | wrapped | literal. See CreateBodyShape.',
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5129c0c-e9ef-449f-8be9-0208e0cde8b5' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'UpdateBodyKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c5129c0c-e9ef-449f-8be9-0208e0cde8b5',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100070,
            'UpdateBodyKey',
            'Update Body Key',
            'Wrapper key for update body when UpdateBodyShape=wrapped.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a67efd5a-4526-4dff-8436-62a20413ca83' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'UpdateIDLocation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a67efd5a-4526-4dff-8436-62a20413ca83',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100071,
            'UpdateIDLocation',
            'Update ID Location',
            'For update: where the target record ID is located in the request — typically ''path'' (substituted into UpdateAPIPath URL template).',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcf86e04-4c89-41a7-91d2-4e952e49bdea' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'DeleteAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bcf86e04-4c89-41a7-91d2-4e952e49bdea',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100072,
            'DeleteAPIPath',
            'Delete API Path',
            'HTTP path template for delete operations. Typically contains {ID} placeholder. NULL means delete not supported via metadata-driven path. (Existing DeleteMethod column carries the verb.)',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd798a7ef-3ac5-4702-9954-509f7ece1130' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'DeleteIDLocation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd798a7ef-3ac5-4702-9954-509f7ece1130',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100073,
            'DeleteIDLocation',
            'Delete ID Location',
            'For delete: where the target record ID is located — typically ''path''.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '292aa949-49e1-4c5e-b8e3-bf6ad324053c' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'IncrementalWatermarkField')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '292aa949-49e1-4c5e-b8e3-bf6ad324053c',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100074,
            'IncrementalWatermarkField',
            'Incremental Watermark Field',
            'Vendor field name marking "last changed" — drives incremental sync filter when SupportsIncrementalSync=1. The exact filter syntax (e.g., $filter=Modified gt {value} or modified_since={value}) lives in Configuration.incrementalFilterFormat. Provable-only: leave NULL if docs do not name a watermark field.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f4067e7-2611-429c-b7ae-c9cf008057f2' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'MetadataSource')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1f4067e7-2611-429c-b7ae-c9cf008057f2',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100075,
            'MetadataSource',
            'Metadata Source',
            'Provenance of this IntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Declared',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 60be6d9f-5d36-45c0-ba64-31499fc0463c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('60be6d9f-5d36-45c0-ba64-31499fc0463c', 'D798A7EF-3AC5-4702-9954-509F7ECE1130', 1, 'body', 'body', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 143ad778-2402-4ac1-afb1-718511f1c99c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('143ad778-2402-4ac1-afb1-718511f1c99c', 'D798A7EF-3AC5-4702-9954-509F7ECE1130', 2, 'header', 'header', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cb6d83ff-2465-48b8-ab92-c6721d7f8266 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cb6d83ff-2465-48b8-ab92-c6721d7f8266', 'D798A7EF-3AC5-4702-9954-509F7ECE1130', 3, 'n/a', 'n/a', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 29f035a4-94ea-4832-bc73-9f5834cf811f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('29f035a4-94ea-4832-bc73-9f5834cf811f', 'D798A7EF-3AC5-4702-9954-509F7ECE1130', 4, 'path', 'path', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D798A7EF-3AC5-4702-9954-509F7ECE1130 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D798A7EF-3AC5-4702-9954-509F7ECE1130';

/* SQL text to insert entity field value with ID ea670d50-6586-4e77-99ea-6256dea37100 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ea670d50-6586-4e77-99ea-6256dea37100', '1F4067E7-2611-429C-B7AE-C9CF008057F2', 1, 'Custom', 'Custom', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 023872df-cece-460c-96e4-acf748f54fab */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('023872df-cece-460c-96e4-acf748f54fab', '1F4067E7-2611-429C-B7AE-C9CF008057F2', 2, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2b3f0a02-dc95-440e-bbbb-f9a4363c6f0c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2b3f0a02-dc95-440e-bbbb-f9a4363c6f0c', '1F4067E7-2611-429C-B7AE-C9CF008057F2', 3, 'Discovered', 'Discovered', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1F4067E7-2611-429C-B7AE-C9CF008057F2 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1F4067E7-2611-429C-B7AE-C9CF008057F2';

/* SQL text to insert entity field value with ID 05b8ca09-5885-4a05-a996-0389ba4871ca */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('05b8ca09-5885-4a05-a996-0389ba4871ca', '538B2994-E837-4D07-B89E-6E38D2B2B180', 1, 'Custom', 'Custom', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 056c904f-ed04-429d-8ab9-79b110c6006c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('056c904f-ed04-429d-8ab9-79b110c6006c', '538B2994-E837-4D07-B89E-6E38D2B2B180', 2, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID acfc91e7-30a7-4714-af8c-86b5f2c22606 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('acfc91e7-30a7-4714-af8c-86b5f2c22606', '538B2994-E837-4D07-B89E-6E38D2B2B180', 3, 'Discovered', 'Discovered', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 538B2994-E837-4D07-B89E-6E38D2B2B180 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='538B2994-E837-4D07-B89E-6E38D2B2B180';

/* SQL text to insert entity field value with ID 43a0b7e8-f704-4a04-bcec-d839fecb690d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('43a0b7e8-f704-4a04-bcec-d839fecb690d', '337E6B36-5174-495F-8C5A-14D406BC9361', 1, 'flat', 'flat', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 58ceebe1-723a-41ef-9f00-ee70634ed3e6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58ceebe1-723a-41ef-9f00-ee70634ed3e6', '337E6B36-5174-495F-8C5A-14D406BC9361', 2, 'literal', 'literal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e63a6d81-03e6-4f8d-bd42-55d9b673b559 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e63a6d81-03e6-4f8d-bd42-55d9b673b559', '337E6B36-5174-495F-8C5A-14D406BC9361', 3, 'wrapped', 'wrapped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 337E6B36-5174-495F-8C5A-14D406BC9361 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='337E6B36-5174-495F-8C5A-14D406BC9361';

/* SQL text to insert entity field value with ID 09238cc6-4a4c-465f-b890-172fe673704a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('09238cc6-4a4c-465f-b890-172fe673704a', '74AAB7FA-D6C8-4B76-8E29-3928B76B54E8', 1, 'flat', 'flat', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f0600f6a-58a0-43c9-a698-3276daaf928e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f0600f6a-58a0-43c9-a698-3276daaf928e', '74AAB7FA-D6C8-4B76-8E29-3928B76B54E8', 2, 'literal', 'literal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3c042939-5781-4d9f-bf97-105c8733002f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3c042939-5781-4d9f-bf97-105c8733002f', '74AAB7FA-D6C8-4B76-8E29-3928B76B54E8', 3, 'wrapped', 'wrapped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 74AAB7FA-D6C8-4B76-8E29-3928B76B54E8 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='74AAB7FA-D6C8-4B76-8E29-3928B76B54E8';

/* SQL text to insert entity field value with ID 52ea63a1-dcf6-41ac-b3a0-7d06f9b81d2c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('52ea63a1-dcf6-41ac-b3a0-7d06f9b81d2c', 'FC96CBFF-36B9-4A0B-ACB4-43087D6F3D6D', 1, 'body', 'body', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 72bd02ba-d6f8-4bdc-ba92-cec5188d3fc3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('72bd02ba-d6f8-4bdc-ba92-cec5188d3fc3', 'FC96CBFF-36B9-4A0B-ACB4-43087D6F3D6D', 2, 'header', 'header', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b4ec5014-1d66-4902-941f-78a698f3a6cf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b4ec5014-1d66-4902-941f-78a698f3a6cf', 'FC96CBFF-36B9-4A0B-ACB4-43087D6F3D6D', 3, 'n/a', 'n/a', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 22c008de-b398-4a00-94e0-68e4122ab312 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('22c008de-b398-4a00-94e0-68e4122ab312', 'FC96CBFF-36B9-4A0B-ACB4-43087D6F3D6D', 4, 'path', 'path', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID FC96CBFF-36B9-4A0B-ACB4-43087D6F3D6D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FC96CBFF-36B9-4A0B-ACB4-43087D6F3D6D';

/* SQL text to insert entity field value with ID 3da5cb47-f85e-4143-96f7-21847e8e2fbe */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3da5cb47-f85e-4143-96f7-21847e8e2fbe', 'A67EFD5A-4526-4DFF-8436-62A20413CA83', 1, 'body', 'body', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4d184167-489c-45bb-8460-cc15989fd528 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4d184167-489c-45bb-8460-cc15989fd528', 'A67EFD5A-4526-4DFF-8436-62A20413CA83', 2, 'header', 'header', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ff0439c4-caad-467a-9d51-6dcb5fd5c0a9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ff0439c4-caad-467a-9d51-6dcb5fd5c0a9', 'A67EFD5A-4526-4DFF-8436-62A20413CA83', 3, 'n/a', 'n/a', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 58199c08-5995-4661-9af0-682872f4defb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58199c08-5995-4661-9af0-682872f4defb', 'A67EFD5A-4526-4DFF-8436-62A20413CA83', 4, 'path', 'path', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A67EFD5A-4526-4DFF-8436-62A20413CA83 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A67EFD5A-4526-4DFF-8436-62A20413CA83';

/* Index for Foreign Keys for IntegrationObjectField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key IntegrationObjectID in table IntegrationObjectField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IntegrationObjectField_IntegrationObjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IntegrationObjectField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IntegrationObjectField_IntegrationObjectID ON [${flyway:defaultSchema}].[IntegrationObjectField] ([IntegrationObjectID]);

-- Index for foreign key RelatedIntegrationObjectID in table IntegrationObjectField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IntegrationObjectField_RelatedIntegrationObjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IntegrationObjectField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IntegrationObjectField_RelatedIntegrationObjectID ON [${flyway:defaultSchema}].[IntegrationObjectField] ([RelatedIntegrationObjectID]);

/* Index for Foreign Keys for IntegrationObject */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key IntegrationID in table IntegrationObject
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IntegrationObject_IntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IntegrationObject]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IntegrationObject_IntegrationID ON [${flyway:defaultSchema}].[IntegrationObject] ([IntegrationID]);

/* Base View SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: vwIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Object Fields
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IntegrationObjectField
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrationObjectFields]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrationObjectFields];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrationObjectFields]
AS
SELECT
    i.*,
    MJIntegrationObject_IntegrationObjectID.[Name] AS [IntegrationObject],
    MJIntegrationObject_RelatedIntegrationObjectID.[Name] AS [RelatedIntegrationObject]
FROM
    [${flyway:defaultSchema}].[IntegrationObjectField] AS i
INNER JOIN
    [${flyway:defaultSchema}].[IntegrationObject] AS MJIntegrationObject_IntegrationObjectID
  ON
    [i].[IntegrationObjectID] = MJIntegrationObject_IntegrationObjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[IntegrationObject] AS MJIntegrationObject_RelatedIntegrationObjectID
  ON
    [i].[RelatedIntegrationObjectID] = MJIntegrationObject_RelatedIntegrationObjectID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjectFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: Permissions for vwIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjectFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spCreateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObjectField]
    @ID uniqueidentifier = NULL,
    @IntegrationObjectID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @Type nvarchar(100),
    @Length_Clear bit = 0,
    @Length int = NULL,
    @Precision_Clear bit = 0,
    @Precision int = NULL,
    @Scale_Clear bit = 0,
    @Scale int = NULL,
    @AllowsNull bit = NULL,
    @DefaultValue_Clear bit = 0,
    @DefaultValue nvarchar(255) = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUniqueKey bit = NULL,
    @IsReadOnly bit = NULL,
    @IsRequired bit = NULL,
    @RelatedIntegrationObjectID_Clear bit = 0,
    @RelatedIntegrationObjectID uniqueidentifier = NULL,
    @RelatedIntegrationObjectFieldName_Clear bit = 0,
    @RelatedIntegrationObjectFieldName nvarchar(255) = NULL,
    @Sequence int = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Status nvarchar(25) = NULL,
    @IsCustom bit = NULL,
    @MetadataSource nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObjectField]
            (
                [ID],
                [IntegrationObjectID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [Type],
                [Length],
                [Precision],
                [Scale],
                [AllowsNull],
                [DefaultValue],
                [IsPrimaryKey],
                [IsUniqueKey],
                [IsReadOnly],
                [IsRequired],
                [RelatedIntegrationObjectID],
                [RelatedIntegrationObjectFieldName],
                [Sequence],
                [Configuration],
                [Status],
                [IsCustom],
                [MetadataSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @IntegrationObjectID,
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                @Type,
                CASE WHEN @Length_Clear = 1 THEN NULL ELSE ISNULL(@Length, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Scale_Clear = 1 THEN NULL ELSE ISNULL(@Scale, NULL) END,
                ISNULL(@AllowsNull, 1),
                CASE WHEN @DefaultValue_Clear = 1 THEN NULL ELSE ISNULL(@DefaultValue, NULL) END,
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUniqueKey, 0),
                ISNULL(@IsReadOnly, 0),
                ISNULL(@IsRequired, 0),
                CASE WHEN @RelatedIntegrationObjectID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedIntegrationObjectID, NULL) END,
                CASE WHEN @RelatedIntegrationObjectFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedIntegrationObjectFieldName, NULL) END,
                ISNULL(@Sequence, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsCustom, 0),
                ISNULL(@MetadataSource, 'Declared')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObjectField]
            (
                [IntegrationObjectID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [Type],
                [Length],
                [Precision],
                [Scale],
                [AllowsNull],
                [DefaultValue],
                [IsPrimaryKey],
                [IsUniqueKey],
                [IsReadOnly],
                [IsRequired],
                [RelatedIntegrationObjectID],
                [RelatedIntegrationObjectFieldName],
                [Sequence],
                [Configuration],
                [Status],
                [IsCustom],
                [MetadataSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @IntegrationObjectID,
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                @Type,
                CASE WHEN @Length_Clear = 1 THEN NULL ELSE ISNULL(@Length, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Scale_Clear = 1 THEN NULL ELSE ISNULL(@Scale, NULL) END,
                ISNULL(@AllowsNull, 1),
                CASE WHEN @DefaultValue_Clear = 1 THEN NULL ELSE ISNULL(@DefaultValue, NULL) END,
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUniqueKey, 0),
                ISNULL(@IsReadOnly, 0),
                ISNULL(@IsRequired, 0),
                CASE WHEN @RelatedIntegrationObjectID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedIntegrationObjectID, NULL) END,
                CASE WHEN @RelatedIntegrationObjectFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedIntegrationObjectFieldName, NULL) END,
                ISNULL(@Sequence, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsCustom, 0),
                ISNULL(@MetadataSource, 'Declared')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrationObjectFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spUpdateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObjectField]
    @ID uniqueidentifier,
    @IntegrationObjectID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @Type nvarchar(100) = NULL,
    @Length_Clear bit = 0,
    @Length int = NULL,
    @Precision_Clear bit = 0,
    @Precision int = NULL,
    @Scale_Clear bit = 0,
    @Scale int = NULL,
    @AllowsNull bit = NULL,
    @DefaultValue_Clear bit = 0,
    @DefaultValue nvarchar(255) = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUniqueKey bit = NULL,
    @IsReadOnly bit = NULL,
    @IsRequired bit = NULL,
    @RelatedIntegrationObjectID_Clear bit = 0,
    @RelatedIntegrationObjectID uniqueidentifier = NULL,
    @RelatedIntegrationObjectFieldName_Clear bit = 0,
    @RelatedIntegrationObjectFieldName nvarchar(255) = NULL,
    @Sequence int = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Status nvarchar(25) = NULL,
    @IsCustom bit = NULL,
    @MetadataSource nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObjectField]
    SET
        [IntegrationObjectID] = ISNULL(@IntegrationObjectID, [IntegrationObjectID]),
        [Name] = ISNULL(@Name, [Name]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Category] = CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, [Category]) END,
        [Type] = ISNULL(@Type, [Type]),
        [Length] = CASE WHEN @Length_Clear = 1 THEN NULL ELSE ISNULL(@Length, [Length]) END,
        [Precision] = CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, [Precision]) END,
        [Scale] = CASE WHEN @Scale_Clear = 1 THEN NULL ELSE ISNULL(@Scale, [Scale]) END,
        [AllowsNull] = ISNULL(@AllowsNull, [AllowsNull]),
        [DefaultValue] = CASE WHEN @DefaultValue_Clear = 1 THEN NULL ELSE ISNULL(@DefaultValue, [DefaultValue]) END,
        [IsPrimaryKey] = ISNULL(@IsPrimaryKey, [IsPrimaryKey]),
        [IsUniqueKey] = ISNULL(@IsUniqueKey, [IsUniqueKey]),
        [IsReadOnly] = ISNULL(@IsReadOnly, [IsReadOnly]),
        [IsRequired] = ISNULL(@IsRequired, [IsRequired]),
        [RelatedIntegrationObjectID] = CASE WHEN @RelatedIntegrationObjectID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedIntegrationObjectID, [RelatedIntegrationObjectID]) END,
        [RelatedIntegrationObjectFieldName] = CASE WHEN @RelatedIntegrationObjectFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedIntegrationObjectFieldName, [RelatedIntegrationObjectFieldName]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [Status] = ISNULL(@Status, [Status]),
        [IsCustom] = ISNULL(@IsCustom, [IsCustom]),
        [MetadataSource] = ISNULL(@MetadataSource, [MetadataSource])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrationObjectFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrationObjectFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IntegrationObjectField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegrationObjectField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegrationObjectField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegrationObjectField
ON [${flyway:defaultSchema}].[IntegrationObjectField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObjectField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IntegrationObjectField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Objects
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IntegrationObject
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrationObjects]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrationObjects];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrationObjects]
AS
SELECT
    i.*,
    MJIntegration_IntegrationID.[Name] AS [Integration]
FROM
    [${flyway:defaultSchema}].[IntegrationObject] AS i
INNER JOIN
    [${flyway:defaultSchema}].[Integration] AS MJIntegration_IntegrationID
  ON
    [i].[IntegrationID] = MJIntegration_IntegrationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: Permissions for vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spCreateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObject]
    @ID uniqueidentifier = NULL,
    @IntegrationID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @APIPath nvarchar(500),
    @ResponseDataKey_Clear bit = 0,
    @ResponseDataKey nvarchar(255) = NULL,
    @DefaultPageSize int = NULL,
    @SupportsPagination bit = NULL,
    @PaginationType nvarchar(20) = NULL,
    @SupportsIncrementalSync bit = NULL,
    @SupportsWrite bit = NULL,
    @DefaultQueryParams_Clear bit = 0,
    @DefaultQueryParams nvarchar(MAX) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @Status nvarchar(25) = NULL,
    @WriteAPIPath_Clear bit = 0,
    @WriteAPIPath nvarchar(500) = NULL,
    @WriteMethod_Clear bit = 0,
    @WriteMethod nvarchar(10) = NULL,
    @DeleteMethod_Clear bit = 0,
    @DeleteMethod nvarchar(10) = NULL,
    @IsCustom bit = NULL,
    @CreateAPIPath_Clear bit = 0,
    @CreateAPIPath nvarchar(MAX) = NULL,
    @CreateMethod_Clear bit = 0,
    @CreateMethod nvarchar(20) = NULL,
    @CreateBodyShape_Clear bit = 0,
    @CreateBodyShape nvarchar(50) = NULL,
    @CreateBodyKey_Clear bit = 0,
    @CreateBodyKey nvarchar(100) = NULL,
    @CreateIDLocation_Clear bit = 0,
    @CreateIDLocation nvarchar(20) = NULL,
    @UpdateAPIPath_Clear bit = 0,
    @UpdateAPIPath nvarchar(MAX) = NULL,
    @UpdateMethod_Clear bit = 0,
    @UpdateMethod nvarchar(20) = NULL,
    @UpdateBodyShape_Clear bit = 0,
    @UpdateBodyShape nvarchar(50) = NULL,
    @UpdateBodyKey_Clear bit = 0,
    @UpdateBodyKey nvarchar(100) = NULL,
    @UpdateIDLocation_Clear bit = 0,
    @UpdateIDLocation nvarchar(20) = NULL,
    @DeleteAPIPath_Clear bit = 0,
    @DeleteAPIPath nvarchar(MAX) = NULL,
    @DeleteIDLocation_Clear bit = 0,
    @DeleteIDLocation nvarchar(20) = NULL,
    @IncrementalWatermarkField_Clear bit = 0,
    @IncrementalWatermarkField nvarchar(255) = NULL,
    @MetadataSource nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObject]
            (
                [ID],
                [IntegrationID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [APIPath],
                [ResponseDataKey],
                [DefaultPageSize],
                [SupportsPagination],
                [PaginationType],
                [SupportsIncrementalSync],
                [SupportsWrite],
                [DefaultQueryParams],
                [Configuration],
                [Sequence],
                [Status],
                [WriteAPIPath],
                [WriteMethod],
                [DeleteMethod],
                [IsCustom],
                [CreateAPIPath],
                [CreateMethod],
                [CreateBodyShape],
                [CreateBodyKey],
                [CreateIDLocation],
                [UpdateAPIPath],
                [UpdateMethod],
                [UpdateBodyShape],
                [UpdateBodyKey],
                [UpdateIDLocation],
                [DeleteAPIPath],
                [DeleteIDLocation],
                [IncrementalWatermarkField],
                [MetadataSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @IntegrationID,
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                @APIPath,
                CASE WHEN @ResponseDataKey_Clear = 1 THEN NULL ELSE ISNULL(@ResponseDataKey, NULL) END,
                ISNULL(@DefaultPageSize, 100),
                ISNULL(@SupportsPagination, 1),
                ISNULL(@PaginationType, 'PageNumber'),
                ISNULL(@SupportsIncrementalSync, 0),
                ISNULL(@SupportsWrite, 0),
                CASE WHEN @DefaultQueryParams_Clear = 1 THEN NULL ELSE ISNULL(@DefaultQueryParams, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @WriteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@WriteAPIPath, NULL) END,
                CASE WHEN @WriteMethod_Clear = 1 THEN NULL ELSE ISNULL(@WriteMethod, 'POST') END,
                CASE WHEN @DeleteMethod_Clear = 1 THEN NULL ELSE ISNULL(@DeleteMethod, 'DELETE') END,
                ISNULL(@IsCustom, 0),
                CASE WHEN @CreateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@CreateAPIPath, NULL) END,
                CASE WHEN @CreateMethod_Clear = 1 THEN NULL ELSE ISNULL(@CreateMethod, NULL) END,
                CASE WHEN @CreateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyShape, NULL) END,
                CASE WHEN @CreateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyKey, NULL) END,
                CASE WHEN @CreateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@CreateIDLocation, NULL) END,
                CASE WHEN @UpdateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@UpdateAPIPath, NULL) END,
                CASE WHEN @UpdateMethod_Clear = 1 THEN NULL ELSE ISNULL(@UpdateMethod, NULL) END,
                CASE WHEN @UpdateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyShape, NULL) END,
                CASE WHEN @UpdateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyKey, NULL) END,
                CASE WHEN @UpdateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@UpdateIDLocation, NULL) END,
                CASE WHEN @DeleteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@DeleteAPIPath, NULL) END,
                CASE WHEN @DeleteIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@DeleteIDLocation, NULL) END,
                CASE WHEN @IncrementalWatermarkField_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalWatermarkField, NULL) END,
                ISNULL(@MetadataSource, 'Declared')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObject]
            (
                [IntegrationID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [APIPath],
                [ResponseDataKey],
                [DefaultPageSize],
                [SupportsPagination],
                [PaginationType],
                [SupportsIncrementalSync],
                [SupportsWrite],
                [DefaultQueryParams],
                [Configuration],
                [Sequence],
                [Status],
                [WriteAPIPath],
                [WriteMethod],
                [DeleteMethod],
                [IsCustom],
                [CreateAPIPath],
                [CreateMethod],
                [CreateBodyShape],
                [CreateBodyKey],
                [CreateIDLocation],
                [UpdateAPIPath],
                [UpdateMethod],
                [UpdateBodyShape],
                [UpdateBodyKey],
                [UpdateIDLocation],
                [DeleteAPIPath],
                [DeleteIDLocation],
                [IncrementalWatermarkField],
                [MetadataSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @IntegrationID,
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                @APIPath,
                CASE WHEN @ResponseDataKey_Clear = 1 THEN NULL ELSE ISNULL(@ResponseDataKey, NULL) END,
                ISNULL(@DefaultPageSize, 100),
                ISNULL(@SupportsPagination, 1),
                ISNULL(@PaginationType, 'PageNumber'),
                ISNULL(@SupportsIncrementalSync, 0),
                ISNULL(@SupportsWrite, 0),
                CASE WHEN @DefaultQueryParams_Clear = 1 THEN NULL ELSE ISNULL(@DefaultQueryParams, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @WriteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@WriteAPIPath, NULL) END,
                CASE WHEN @WriteMethod_Clear = 1 THEN NULL ELSE ISNULL(@WriteMethod, 'POST') END,
                CASE WHEN @DeleteMethod_Clear = 1 THEN NULL ELSE ISNULL(@DeleteMethod, 'DELETE') END,
                ISNULL(@IsCustom, 0),
                CASE WHEN @CreateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@CreateAPIPath, NULL) END,
                CASE WHEN @CreateMethod_Clear = 1 THEN NULL ELSE ISNULL(@CreateMethod, NULL) END,
                CASE WHEN @CreateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyShape, NULL) END,
                CASE WHEN @CreateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyKey, NULL) END,
                CASE WHEN @CreateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@CreateIDLocation, NULL) END,
                CASE WHEN @UpdateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@UpdateAPIPath, NULL) END,
                CASE WHEN @UpdateMethod_Clear = 1 THEN NULL ELSE ISNULL(@UpdateMethod, NULL) END,
                CASE WHEN @UpdateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyShape, NULL) END,
                CASE WHEN @UpdateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyKey, NULL) END,
                CASE WHEN @UpdateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@UpdateIDLocation, NULL) END,
                CASE WHEN @DeleteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@DeleteAPIPath, NULL) END,
                CASE WHEN @DeleteIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@DeleteIDLocation, NULL) END,
                CASE WHEN @IncrementalWatermarkField_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalWatermarkField, NULL) END,
                ISNULL(@MetadataSource, 'Declared')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrationObjects] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spUpdateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObject]
    @ID uniqueidentifier,
    @IntegrationID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @APIPath nvarchar(500) = NULL,
    @ResponseDataKey_Clear bit = 0,
    @ResponseDataKey nvarchar(255) = NULL,
    @DefaultPageSize int = NULL,
    @SupportsPagination bit = NULL,
    @PaginationType nvarchar(20) = NULL,
    @SupportsIncrementalSync bit = NULL,
    @SupportsWrite bit = NULL,
    @DefaultQueryParams_Clear bit = 0,
    @DefaultQueryParams nvarchar(MAX) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @Status nvarchar(25) = NULL,
    @WriteAPIPath_Clear bit = 0,
    @WriteAPIPath nvarchar(500) = NULL,
    @WriteMethod_Clear bit = 0,
    @WriteMethod nvarchar(10) = NULL,
    @DeleteMethod_Clear bit = 0,
    @DeleteMethod nvarchar(10) = NULL,
    @IsCustom bit = NULL,
    @CreateAPIPath_Clear bit = 0,
    @CreateAPIPath nvarchar(MAX) = NULL,
    @CreateMethod_Clear bit = 0,
    @CreateMethod nvarchar(20) = NULL,
    @CreateBodyShape_Clear bit = 0,
    @CreateBodyShape nvarchar(50) = NULL,
    @CreateBodyKey_Clear bit = 0,
    @CreateBodyKey nvarchar(100) = NULL,
    @CreateIDLocation_Clear bit = 0,
    @CreateIDLocation nvarchar(20) = NULL,
    @UpdateAPIPath_Clear bit = 0,
    @UpdateAPIPath nvarchar(MAX) = NULL,
    @UpdateMethod_Clear bit = 0,
    @UpdateMethod nvarchar(20) = NULL,
    @UpdateBodyShape_Clear bit = 0,
    @UpdateBodyShape nvarchar(50) = NULL,
    @UpdateBodyKey_Clear bit = 0,
    @UpdateBodyKey nvarchar(100) = NULL,
    @UpdateIDLocation_Clear bit = 0,
    @UpdateIDLocation nvarchar(20) = NULL,
    @DeleteAPIPath_Clear bit = 0,
    @DeleteAPIPath nvarchar(MAX) = NULL,
    @DeleteIDLocation_Clear bit = 0,
    @DeleteIDLocation nvarchar(20) = NULL,
    @IncrementalWatermarkField_Clear bit = 0,
    @IncrementalWatermarkField nvarchar(255) = NULL,
    @MetadataSource nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObject]
    SET
        [IntegrationID] = ISNULL(@IntegrationID, [IntegrationID]),
        [Name] = ISNULL(@Name, [Name]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Category] = CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, [Category]) END,
        [APIPath] = ISNULL(@APIPath, [APIPath]),
        [ResponseDataKey] = CASE WHEN @ResponseDataKey_Clear = 1 THEN NULL ELSE ISNULL(@ResponseDataKey, [ResponseDataKey]) END,
        [DefaultPageSize] = ISNULL(@DefaultPageSize, [DefaultPageSize]),
        [SupportsPagination] = ISNULL(@SupportsPagination, [SupportsPagination]),
        [PaginationType] = ISNULL(@PaginationType, [PaginationType]),
        [SupportsIncrementalSync] = ISNULL(@SupportsIncrementalSync, [SupportsIncrementalSync]),
        [SupportsWrite] = ISNULL(@SupportsWrite, [SupportsWrite]),
        [DefaultQueryParams] = CASE WHEN @DefaultQueryParams_Clear = 1 THEN NULL ELSE ISNULL(@DefaultQueryParams, [DefaultQueryParams]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Status] = ISNULL(@Status, [Status]),
        [WriteAPIPath] = CASE WHEN @WriteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@WriteAPIPath, [WriteAPIPath]) END,
        [WriteMethod] = CASE WHEN @WriteMethod_Clear = 1 THEN NULL ELSE ISNULL(@WriteMethod, [WriteMethod]) END,
        [DeleteMethod] = CASE WHEN @DeleteMethod_Clear = 1 THEN NULL ELSE ISNULL(@DeleteMethod, [DeleteMethod]) END,
        [IsCustom] = ISNULL(@IsCustom, [IsCustom]),
        [CreateAPIPath] = CASE WHEN @CreateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@CreateAPIPath, [CreateAPIPath]) END,
        [CreateMethod] = CASE WHEN @CreateMethod_Clear = 1 THEN NULL ELSE ISNULL(@CreateMethod, [CreateMethod]) END,
        [CreateBodyShape] = CASE WHEN @CreateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyShape, [CreateBodyShape]) END,
        [CreateBodyKey] = CASE WHEN @CreateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyKey, [CreateBodyKey]) END,
        [CreateIDLocation] = CASE WHEN @CreateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@CreateIDLocation, [CreateIDLocation]) END,
        [UpdateAPIPath] = CASE WHEN @UpdateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@UpdateAPIPath, [UpdateAPIPath]) END,
        [UpdateMethod] = CASE WHEN @UpdateMethod_Clear = 1 THEN NULL ELSE ISNULL(@UpdateMethod, [UpdateMethod]) END,
        [UpdateBodyShape] = CASE WHEN @UpdateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyShape, [UpdateBodyShape]) END,
        [UpdateBodyKey] = CASE WHEN @UpdateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyKey, [UpdateBodyKey]) END,
        [UpdateIDLocation] = CASE WHEN @UpdateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@UpdateIDLocation, [UpdateIDLocation]) END,
        [DeleteAPIPath] = CASE WHEN @DeleteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@DeleteAPIPath, [DeleteAPIPath]) END,
        [DeleteIDLocation] = CASE WHEN @DeleteIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@DeleteIDLocation, [DeleteIDLocation]) END,
        [IncrementalWatermarkField] = CASE WHEN @IncrementalWatermarkField_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalWatermarkField, [IncrementalWatermarkField]) END,
        [MetadataSource] = ISNULL(@MetadataSource, [MetadataSource])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrationObjects] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrationObjects]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObject] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IntegrationObject table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegrationObject]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegrationObject];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegrationObject
ON [${flyway:defaultSchema}].[IntegrationObject]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObject]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IntegrationObject] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spDeleteIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObjectField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IntegrationObjectField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spDeleteIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObject]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IntegrationObject]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DA3BC5CE-671C-48AC-9CD5-497CA602D0E5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'F087BB9D-A16E-4778-A711-026B5CDB5ECB'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1F4067E7-2611-429C-B7AE-C9CF008057F2'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 27 fields */

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C29BAC47-FD92-4209-B600-998618C2A052' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A40B0908-76CC-4D93-B7FF-659D450CDF19' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E19F566-6FFB-4B64-96C9-8EA44B3DAE08' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IntegrationObjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8EA456AD-785F-4E37-B397-8FF6F2040810' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '22A62BF2-861B-4B29-A7E1-B69B476E706E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObjectFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFD4B858-690A-4AD6-9BCE-DACBE0F0BDF3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '2EFA2D36-459B-4433-BFBC-4E76E8A5A461' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IntegrationObject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DCDA729-DB83-421E-B5EC-1B1636C7BC1E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1ED4D02-2463-457C-9C8D-761D24CC5288' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F087BB9D-A16E-4778-A711-026B5CDB5ECB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C0279D61-5DD7-4636-ACAF-3C07B4EBF599' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB935245-A13B-46BA-B54C-BEDE08FAFEC0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC99E8BA-DDB8-4CFB-8F0A-A4A68769A942' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BC346A1-8015-4F20-9247-CB0039EE14E4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsCustom 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA459761-25B4-4820-B056-E10E04F8EC28' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.MetadataSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '538B2994-E837-4D07-B89E-6E38D2B2B180' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE592595-E4FD-458A-A892-918DB3ABC0B8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Length 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A184FA33-D1E3-4341-854A-63BA62571622' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Precision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC62F3D1-514C-4850-A884-098ACCEA440C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Scale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A27F5839-CA61-42FC-B724-C4F885FB5FA0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.AllowsNull 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F48E0A4-576C-4746-AF78-0CED62880881' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E996E3E-68A6-468D-92B5-B1E7D905AB64' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsPrimaryKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A41406EF-D751-4E1D-8B03-537EC3F5ED26' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsUniqueKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB6D509C-4DDC-4F2B-A2ED-6ABDEFD210A5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsReadOnly 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B8579C3-5351-4263-AEF4-BB44E30D4B4D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsRequired 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA3BC5CE-671C-48AC-9CD5-497CA602D0E5' AND AutoUpdateCategory = 1;

/* Set categories for 38 fields */

-- UPDATE Entity Field Category Info MJ: Integration Objects.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5F7651F-56E2-4E92-A9FE-CFCD61B58B25' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C7B2511-B32A-4E05-AD8F-71A8D7438E96' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '17416191-6BA9-4D7D-B38D-5D32220C994E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.IntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0EAB738-4BB1-499F-80FC-AA8A0B46B389' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.Integration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8DEFCEAD-C227-45E0-AF79-6B3318C563C7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F19F87B-4609-4738-97D6-8627DE23AF4B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DBFED2A5-355D-4617-B4F8-237B4D3B2365' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F0F0147-386F-45C8-AA9F-021C26B634A5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9057E47C-7633-4B86-8ADF-F09044FE4470' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '027BC6FB-AC73-41C5-8856-981FB0031897' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.IsCustom 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A4675F9-36F6-4EDF-83C0-29DFFEE0B61E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.MetadataSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F4067E7-2611-429C-B7AE-C9CF008057F2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.APIPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1CFA6C37-9057-4662-8C40-F835AA972EDF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.ResponseDataKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADE52A5E-ADBA-4414-AAE2-12B535F85AC3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.DefaultQueryParams 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '38708EAC-BEC9-4BD1-AFA5-AF93A00F0FEA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'ED9326F4-6377-4FB3-84FA-EBCC9859FC07' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.WriteAPIPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0BEDA5A-9F7B-4611-867D-59AA8EF8B849' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.WriteMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0FC7DA1-9649-427C-AEE2-DF31700F7512' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.DeleteMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3006B046-676A-4DF8-B861-2A9A8EFE059D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.DefaultPageSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85D95D3F-DAD6-492D-90AF-5207D16780EE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsPagination 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27719863-6129-44D5-A77C-7827DB58BD91' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.PaginationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '248DBCEF-E551-4913-8579-200B33459E16' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsIncrementalSync 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C73A053E-44E2-40A8-9A0A-899E6E28AF4D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsWrite 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E48963CB-3027-4554-BF48-52ECA282D983' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.IncrementalWatermarkField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync and Pagination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '292AA949-49E1-4C5E-B8E3-BF6AD324053C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.CreateAPIPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '67D6F7A3-83D6-4F43-89EB-329EF9E0228A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.CreateMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '903FCE8C-131E-42B3-A083-FA1FE2FD08E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.CreateBodyShape 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '337E6B36-5174-495F-8C5A-14D406BC9361' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.CreateBodyKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80669C82-8265-4C45-95A0-DC5C48B03021' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.CreateIDLocation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC96CBFF-36B9-4A0B-ACB4-43087D6F3D6D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.UpdateAPIPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '63B7804B-DECD-42D1-97AA-0EAFDA473472' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.UpdateMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B616F27-4CBF-4699-8A1F-B3563DFE04EC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.UpdateBodyShape 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '74AAB7FA-D6C8-4B76-8E29-3928B76B54E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.UpdateBodyKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5129C0C-E9EF-449F-8BE9-0208E0CDE8B5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.UpdateIDLocation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A67EFD5A-4526-4DFF-8436-62A20413CA83' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.DeleteAPIPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BCF86E04-4C89-41A7-91D2-4E952E49BDEA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Integration Objects.DeleteIDLocation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'CRUD Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D798A7EF-3AC5-4702-9954-509F7ECE1130' AND AutoUpdateCategory = 1;

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"CRUD Configuration":{"icon":"fa fa-edit","description":"Detailed configuration for Create, Update, and Delete operations"}}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND [Name] = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"CRUD Configuration":"fa fa-edit"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND [Name] = 'FieldCategoryIcons';

