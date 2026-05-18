/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b81e18c5-1024-4a72-a665-d3eca6a64fd7' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'APIBaseURL')) BEGIN
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
            'b81e18c5-1024-4a72-a665-d3eca6a64fd7',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100077,
            'APIBaseURL',
            'API Base URL',
            'Base URL the connector calls (e.g., https://api.hubapi.com). When APIBaseURLMode=dynamic-from-auth-response, this is the OAuth bootstrap host only; per-tenant URL comes from auth response.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2cbd44bc-2e77-4e3f-b816-f31542ce064b' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'APIBaseURLMode')) BEGIN
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
            '2cbd44bc-2e77-4e3f-b816-f31542ce064b',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100078,
            'APIBaseURLMode',
            'API Base URL Mode',
            'How the per-tenant API base URL is resolved. static = fixed; dynamic-from-auth-response = read from token response (e.g. Salesforce instance_url); dynamic-from-credential-field = read from CompanyIntegration.Configuration JSON.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01ee2e69-4e17-46fd-9809-3f51c3c03461' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DynamicAPIBaseURLSourceField')) BEGIN
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
            '01ee2e69-4e17-46fd-9809-3f51c3c03461',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100079,
            'DynamicAPIBaseURLSourceField',
            'Dynamic API Base URL Source Field',
            'When APIBaseURLMode is dynamic, names the field in auth response or credential JSON that holds the resolved base URL (e.g., instance_url).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '84038c3e-d715-4b34-a308-07a494c6f524' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TokenRefreshStrategy')) BEGIN
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
            '84038c3e-d715-4b34-a308-07a494c6f524',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100080,
            'TokenRefreshStrategy',
            'Token Refresh Strategy',
            'Token lifecycle pattern. oauth2-refresh = standard OAuth2 refresh-token grant; jwt-resign-periodically = sign a fresh JWT each token TTL; static-token = long-lived API key; none = no token refresh path.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '150b11ed-d13d-454e-9c9a-7bdc7d36dcec' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TokenTTLSeconds')) BEGIN
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
            '150b11ed-d13d-454e-9c9a-7bdc7d36dcec',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100081,
            'TokenTTLSeconds',
            'Token TTL Seconds',
            'Access token time-to-live in seconds when documented by the vendor. Used by OAuth2TokenManager to schedule refresh before expiry.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c36d32e4-2566-4218-b7f6-384e2e4745f3' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AuthHeaderPattern')) BEGIN
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
            'c36d32e4-2566-4218-b7f6-384e2e4745f3',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100082,
            'AuthHeaderPattern',
            'Auth Header Pattern',
            'Wire-format auth header pattern. authorization-bearer = Authorization: Bearer <token>; x-api-key = X-API-Key: <token>; custom-header = vendor-specific (see CustomAuthHeaderName); none-uses-query = auth via query param, not header.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1f3ab25-e5ba-4c8d-b56a-1b16752832d3' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CustomAuthHeaderName')) BEGIN
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
            'd1f3ab25-e5ba-4c8d-b56a-1b16752832d3',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100083,
            'CustomAuthHeaderName',
            'Custom Auth Header Name',
            'When AuthHeaderPattern=custom-header, the vendor-specific header name carrying the credential.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '59b02a44-16c0-4971-a5e4-b278da8e331b' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CredentialFieldSchemaJSON')) BEGIN
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
            '59b02a44-16c0-4971-a5e4-b278da8e331b',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100084,
            'CredentialFieldSchemaJSON',
            'Credential Field Schema JSON',
            'JSON describing which credential fields CompanyIntegration.Configuration must carry for this integration (field names, types, required flag, secret flag). Drives credential-input UI generation.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d057ebd-6b59-49bb-befb-1eca793c21ad' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PaginationCursorParamName')) BEGIN
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
            '5d057ebd-6b59-49bb-befb-1eca793c21ad',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100085,
            'PaginationCursorParamName',
            'Pagination Cursor Param Name',
            'Vendor parameter name carrying the pagination cursor (e.g., after for HubSpot, starting_after for Stripe). Null when PaginationType is not cursor-based.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '33dd2451-37c4-4dd5-bbf3-2c70c551a1c3' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PaginationCursorResponsePath')) BEGIN
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
            '33dd2451-37c4-4dd5-bbf3-2c70c551a1c3',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100086,
            'PaginationCursorResponsePath',
            'Pagination Cursor Response Path',
            'Dotted path inside the response body where the next-page cursor appears (e.g., paging.next.after for HubSpot, next_page for Stripe).',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '46da611b-9dc2-4c16-bc2b-f963cc84d403' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PaginationLimitParamName')) BEGIN
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
            '46da611b-9dc2-4c16-bc2b-f963cc84d403',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100087,
            'PaginationLimitParamName',
            'Pagination Limit Param Name',
            'Vendor parameter name controlling page size (e.g., limit, per_page, page_size).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4edd8648-2199-40db-b04d-54915094975c' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PaginationPageParamName')) BEGIN
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
            '4edd8648-2199-40db-b04d-54915094975c',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100088,
            'PaginationPageParamName',
            'Pagination Page Param Name',
            'Vendor parameter name for page-number pagination (e.g., page). Null when not PageNumber pagination.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f60532a-dbaa-477f-905e-078e4cb6f2dd' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PaginationOffsetParamName')) BEGIN
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
            '0f60532a-dbaa-477f-905e-078e4cb6f2dd',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100089,
            'PaginationOffsetParamName',
            'Pagination Offset Param Name',
            'Vendor parameter name for offset-based pagination (e.g., offset, skip). Null when not Offset pagination.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc3d5499-fab5-4cd2-a5bd-465e3838f337' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PaginationHasMoreResponsePath')) BEGIN
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
            'cc3d5499-fab5-4cd2-a5bd-465e3838f337',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100090,
            'PaginationHasMoreResponsePath',
            'Pagination Has More Response Path',
            'Dotted response path holding the has-more boolean (e.g., has_more for Stripe, paging.next for HubSpot).',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '801299c1-fa52-433a-af4f-312cf7066416' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PaginationTotalCountResponsePath')) BEGIN
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
            '801299c1-fa52-433a-af4f-312cf7066416',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100091,
            'PaginationTotalCountResponsePath',
            'Pagination Total Count Response Path',
            'Dotted response path holding the total-count integer (e.g., total, totalSize). Null when vendor does not return it.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4898d392-50a7-413c-a52b-04ac64dd7d34' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'PaginationMaxPageSize')) BEGIN
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
            '4898d392-50a7-413c-a52b-04ac64dd7d34',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100092,
            'PaginationMaxPageSize',
            'Pagination Max Page Size',
            'Maximum page size the vendor accepts (clamp for client-tunable pagination). Null when vendor enforces a fixed page size.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a60dd467-81d1-415b-b6e7-342fd69f5c97' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ErrorResponseShape')) BEGIN
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
            'a60dd467-81d1-415b-b6e7-342fd69f5c97',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100093,
            'ErrorResponseShape',
            'Error Response Shape',
            'Shape of the vendor''s error response body. json-errors-array = {errors:[{...}]} (Salesforce); envelope-with-error-field = {error:{message,code}} (Stripe); http-status-only = no body; custom = vendor-specific (TransformError override required).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de4869a9-dc0d-42e6-9705-961e9f48b474' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ErrorMessageFieldPath')) BEGIN
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
            'de4869a9-dc0d-42e6-9705-961e9f48b474',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100094,
            'ErrorMessageFieldPath',
            'Error Message Field Path',
            'Dotted path inside the error body where the human-readable error message lives (e.g., error.message, errors[0].message).',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37f27ebc-4535-47b0-97f2-59d92e40c855' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ErrorCodeFieldPath')) BEGIN
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
            '37f27ebc-4535-47b0-97f2-59d92e40c855',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100095,
            'ErrorCodeFieldPath',
            'Error Code Field Path',
            'Dotted path inside the error body where the vendor-specific error code lives (e.g., error.code, errors[0].errorCode).',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7426e673-7939-41e5-8521-b2f6cd753367' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IncrementalSyncCapability')) BEGIN
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
            '7426e673-7939-41e5-8521-b2f6cd753367',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100096,
            'IncrementalSyncCapability',
            'Incremental Sync Capability',
            'How the vendor exposes incremental sync. global-query-param = same param works on every endpoint; per-resource-query-param = different param per IO; webhook-only = events not pull; polling-only = client compares timestamps; none = full re-sync only.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '879ce2f6-695f-42ca-a63f-9d41ba9243a8' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IncrementalQueryParamName')) BEGIN
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
            '879ce2f6-695f-42ca-a63f-9d41ba9243a8',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100097,
            'IncrementalQueryParamName',
            'Incremental Query Param Name',
            'When IncrementalSyncCapability=global-query-param, the vendor parameter name (e.g., modifiedSince, updated[gte], since).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87afc5a8-726a-4a90-bd55-e6e3c9dc453e' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IncrementalQueryParamFormat')) BEGIN
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
            '87afc5a8-726a-4a90-bd55-e6e3c9dc453e',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100098,
            'IncrementalQueryParamFormat',
            'Incremental Query Param Format',
            'Wire format for incremental watermark values. ISO8601 = 2026-01-01T00:00:00Z; epoch-seconds = unix integer; opaque-cursor = vendor-managed string.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8349da2c-7de4-4949-b52f-73813539243e' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'WebhooksAvailable')) BEGIN
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
            '8349da2c-7de4-4949-b52f-73813539243e',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100099,
            'WebhooksAvailable',
            'Webhooks Available',
            'Whether the vendor supports webhook subscriptions for real-time event delivery. When true, populate WebhookSubscriptionAPIPath + signature fields.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2cfa2cd9-1fff-40a3-b733-6e5ae42f94de' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'WebhookSubscriptionAPIPath')) BEGIN
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
            '2cfa2cd9-1fff-40a3-b733-6e5ae42f94de',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100100,
            'WebhookSubscriptionAPIPath',
            'Webhook Subscription API Path',
            'Vendor endpoint path for managing webhook subscriptions (create/delete/list). E.g., /webhooks for Stripe, /api/3/webhook/subscriptions for HubSpot.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f59c97b-637e-497b-b63a-5c67e96fee13' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'WebhookSignatureHeaderName')) BEGIN
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
            '1f59c97b-637e-497b-b63a-5c67e96fee13',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100101,
            'WebhookSignatureHeaderName',
            'Webhook Signature Header Name',
            'HTTP header name carrying the webhook signature for verification (e.g., Stripe-Signature, X-HubSpot-Signature-V3).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '102907cd-c809-41e6-aecf-390626eed0c0' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'WebhookSignatureAlgorithm')) BEGIN
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
            '102907cd-c809-41e6-aecf-390626eed0c0',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100102,
            'WebhookSignatureAlgorithm',
            'Webhook Signature Algorithm',
            'Algorithm used to sign webhook payloads. hmac-sha256 (most common); hmac-sha512; rsa (for vendors using asymmetric signing); none (unsigned).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4c11d17-465d-473d-8c6d-a79ef92c616b' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'BulkOperationsAvailable')) BEGIN
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
            'c4c11d17-465d-473d-8c6d-a79ef92c616b',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100103,
            'BulkOperationsAvailable',
            'Bulk Operations Available',
            'Whether the vendor offers per-object bulk endpoints (batch create/update/delete or async bulk jobs). When true, per-IO BulkAPIPath populated where applicable.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5010472a-801b-4346-b2b6-73da6abb23fe' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'APIVersioningStrategy')) BEGIN
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
            '5010472a-801b-4346-b2b6-73da6abb23fe',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100104,
            'APIVersioningStrategy',
            'API Versioning Strategy',
            'How the vendor identifies API version. path = /v1/ or /v2/ segment; header = Accept or X-API-Version; query = ?api-version=; none = unversioned.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa30224e-8fbb-4566-9c96-1c9e1473c31c' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'APIVersion')) BEGIN
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
            'aa30224e-8fbb-4566-9c96-1c9e1473c31c',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100105,
            'APIVersion',
            'API Version',
            'Currently targeted API version (e.g., v3, 2023-10-16, 60.0). Used by connector to construct paths when APIVersioningStrategy=path, headers when =header, query when =query.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd73c19a6-083a-41db-a28f-c0f54fea1cec' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IdempotencyHeaderName')) BEGIN
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
            'd73c19a6-083a-41db-a28f-c0f54fea1cec',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100106,
            'IdempotencyHeaderName',
            'Idempotency Header Name',
            'HTTP header name the vendor uses for idempotency keys (e.g., Idempotency-Key, Stripe-Idempotency-Key). Null when vendor does not support idempotency.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e2fd39a5-eb10-4f38-95ef-7766a4bb9dc4' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CustomObjectMarkerPattern')) BEGIN
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
            'e2fd39a5-eb10-4f38-95ef-7766a4bb9dc4',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100107,
            'CustomObjectMarkerPattern',
            'Custom Object Marker Pattern',
            'Pattern the vendor uses to mark a sObject as custom vs standard. salesforce-double-underscore-c = Account__c; hubspot-customProperties-namespace = lives under customProperties; prefix-based = vendor prefix on the name; attribute-flagged = explicit isCustom in describe; none = no custom-object concept.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df9d9a15-27c9-4afb-8d56-32af4cfd125f' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CustomFieldMarkerPattern')) BEGIN
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
            'df9d9a15-27c9-4afb-8d56-32af4cfd125f',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100108,
            'CustomFieldMarkerPattern',
            'Custom Field Marker Pattern',
            'Pattern the vendor uses to mark a field as custom vs standard (same enum vocabulary as CustomObjectMarkerPattern but applied at the IOF level).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5c5ac44-82c0-441b-b864-d7c252144a1b' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FKNamingConvention')) BEGIN
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
            'f5c5ac44-82c0-441b-b864-d7c252144a1b',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100109,
            'FKNamingConvention',
            'FK Naming Convention',
            'How the vendor names foreign-key columns. snake-case-id-suffix = customer_id; camelCase-Id-suffix = customerId; object-named = customer (no suffix); vendor-specific = irregular pattern (requires per-vendor detection); none = no convention observed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88b52e1c-d9dc-45d6-ab25-c2cdb8f18ec8' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsAPIWritable')) BEGIN
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
            '88b52e1c-d9dc-45d6-ab25-c2cdb8f18ec8',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100061,
            'IsAPIWritable',
            'Is API Writable',
            'Whether the vendor''s API accepts writes to this field. Distinct from IsReadOnly — IsReadOnly is a per-record runtime check, IsAPIWritable is the design-time API contract. A field can be IsReadOnly=false but IsAPIWritable=false (computed/write-only fields).',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27c5421b-8ee1-4b10-9fa2-6f96332bb34d' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsComputed')) BEGIN
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
            '27c5421b-8ee1-4b10-9fa2-6f96332bb34d',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100062,
            'IsComputed',
            'Is Computed',
            'Whether the vendor calculates this field (formula fields, derived values, aggregations). Computed fields are excluded from write bodies regardless of IsAPIWritable.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df456258-928b-4267-a896-1d607af3488e' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsImmutableAfterCreate')) BEGIN
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
            'df456258-928b-4267-a896-1d607af3488e',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100063,
            'IsImmutableAfterCreate',
            'Is Immutable After Create',
            'Whether this field is writable on Create but rejected on Update (e.g., legal-entity name, primary key alternative keys). CodeBuilder filters this out of Update bodies.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5487a8a-a6a2-44b9-ae05-fc2a37ad56b2' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsCustomField')) BEGIN
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
            'e5487a8a-a6a2-44b9-ae05-fc2a37ad56b2',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100064,
            'IsCustomField',
            'Is Custom Field',
            'Whether this field matches the vendor''s custom-field marker pattern (per CustomFieldMarkerPattern at the integration root). Tenant-specific custom fields surface here.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '045bf5c1-4ae0-4010-80d0-3a4ccda40720' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsIncrementalCursorCandidate')) BEGIN
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
            '045bf5c1-4ae0-4010-80d0-3a4ccda40720',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100065,
            'IsIncrementalCursorCandidate',
            'Is Incremental Cursor Candidate',
            'Whether this field could serve as a watermark for incremental sync (timestamp/version/sequence type). The IO''s IncrementalCursorFieldName must reference an IOF where this flag is true.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '12a58a13-baff-4aa6-a167-6bdad199b389' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsForeignKey')) BEGIN
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
            '12a58a13-baff-4aa6-a167-6bdad199b389',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100066,
            'IsForeignKey',
            'Is Foreign Key',
            'Whether this field is a foreign key (references another IO''s PK). Set by extractor''s universal FK gates (DF1-DF7); complements existing RelatedIntegrationObjectID which holds the target reference itself.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44b0a561-c005-4cf7-a7fc-5afce27ccc44' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'FKDetectionMethod')) BEGIN
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
            '44b0a561-c005-4cf7-a7fc-5afce27ccc44',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100067,
            'FKDetectionMethod',
            'FK Detection Method',
            'Self-reported gate that established the FK claim. openapi-ref = OpenAPI $ref to another schema; sdk-relationship-annotation = SDK type-level annotation; name-pattern-suffix = *Id naming match; url-path-parent = path templating implies parent; vendor-specific = vendor-managed; unknown = inferred but unverified.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f3c5fa8-0de1-4cc1-ad52-a86fd80efd2e' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsDeprecated')) BEGIN
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
            '8f3c5fa8-0de1-4cc1-ad52-a86fd80efd2e',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100068,
            'IsDeprecated',
            'Is Deprecated',
            'Whether the vendor has marked this field as deprecated. Connector code may emit warnings on use; new metadata extractions should not consider this field for cursor/PK candidacy.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82f80ce4-5263-4063-8c49-b200efe01b1e' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'IsBidirectional')) BEGIN
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
            '82f80ce4-5263-4063-8c49-b200efe01b1e',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100083,
            'IsBidirectional',
            'Is Bidirectional',
            'Whether the vendor''s API supports write (Create/Update/Delete) for this object. Distinct from the Supports* verb flags — this is the higher-level "is the object writable at all" capability used to filter Action generation.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c6c44b6a-0fc2-486a-b4df-6fef907e3b40' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'ParentObjectName')) BEGIN
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
            'c6c44b6a-0fc2-486a-b4df-6fef907e3b40',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100084,
            'ParentObjectName',
            'Parent Object Name',
            'When this IO''s API path is nested under another IO (e.g., /orgs/{OrgID}/users), the name of the parent IO. Null for root-level objects.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb6d2887-c539-4d51-836b-73e7a5b72799' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'ParentObjectIDFieldName')) BEGIN
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
            'eb6d2887-c539-4d51-836b-73e7a5b72799',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100085,
            'ParentObjectIDFieldName',
            'Parent Object ID Field Name',
            'Name of the IOF on this IO that holds the parent''s primary key value. Used to resolve path template variables when fetching nested resources.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f900f1e-87d8-4be7-a359-6cd389a62ebb' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'IncrementalCursorFieldName')) BEGIN
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
            '3f900f1e-87d8-4be7-a359-6cd389a62ebb',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100086,
            'IncrementalCursorFieldName',
            'Incremental Cursor Field Name',
            'Name of the IOF whose value is tracked as the incremental-sync watermark for this object. Must match WatermarkService.ValidateWatermark expectations for the chosen IncrementalWatermarkType.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '188245df-68ad-4478-a061-abebdc56d2e6' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'IncrementalWatermarkType')) BEGIN
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
            '188245df-68ad-4478-a061-abebdc56d2e6',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100087,
            'IncrementalWatermarkType',
            'Incremental Watermark Type',
            'Semantic type of the watermark value. Timestamp = date/datetime (comparable); Version = monotonic integer/string; Cursor = opaque vendor cursor; ChangeToken = opaque vendor change marker.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd37e5541-09ae-4796-abc8-e3f474ae0140' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'IsStandardObject')) BEGIN
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
            'd37e5541-09ae-4796-abc8-e3f474ae0140',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100088,
            'IsStandardObject',
            'Is Standard Object',
            'Whether this object is part of the vendor''s standard catalog (true) vs a custom object defined per-tenant (false). Set by extraction from documented sources.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25480329-6c10-485b-908d-a955b9d38ae5' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'IsCustomObject')) BEGIN
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
            '25480329-6c10-485b-908d-a955b9d38ae5',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100089,
            'IsCustomObject',
            'Is Custom Object',
            'Whether this object matches the vendor''s custom-object marker pattern (e.g., __c suffix for Salesforce). Used to route Action generation + runtime handling for tenant-customized schema.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c8d10ee-550b-43f6-9678-fdba04b5609a' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'BulkAPIPath')) BEGIN
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
            '8c8d10ee-550b-43f6-9678-fdba04b5609a',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100090,
            'BulkAPIPath',
            'Bulk API Path',
            'Vendor''s bulk-operation endpoint path for this object (when BulkOperationsAvailable=true at integration level). E.g., /services/data/v60.0/jobs/ingest for Salesforce Bulk API.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21cf89b7-1a6f-48ed-bf37-523f76175ed4' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'BulkAPIMethod')) BEGIN
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
            '21cf89b7-1a6f-48ed-bf37-523f76175ed4',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100091,
            'BulkAPIMethod',
            'Bulk API Method',
            'HTTP method used against BulkAPIPath. Typically POST for bulk-job creation; some vendors use PUT or PATCH.',
            'nvarchar',
            20,
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

/* SQL text to insert entity field value with ID 2c562b96-8d4b-49af-9384-a35eb8e2557a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2c562b96-8d4b-49af-9384-a35eb8e2557a', '2CBD44BC-2E77-4E3F-B816-F31542CE064B', 1, 'dynamic-from-auth-response', 'dynamic-from-auth-response', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID da2cb19f-ebe0-4280-a725-714752c0093d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('da2cb19f-ebe0-4280-a725-714752c0093d', '2CBD44BC-2E77-4E3F-B816-F31542CE064B', 2, 'dynamic-from-credential-field', 'dynamic-from-credential-field', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 94bda5f0-cf86-4edc-b29c-43cf23f10a64 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('94bda5f0-cf86-4edc-b29c-43cf23f10a64', '2CBD44BC-2E77-4E3F-B816-F31542CE064B', 3, 'static', 'static', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2CBD44BC-2E77-4E3F-B816-F31542CE064B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2CBD44BC-2E77-4E3F-B816-F31542CE064B';

/* SQL text to insert entity field value with ID bc8cdc27-03ff-47a0-8f00-5e8c1e8fb9de */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bc8cdc27-03ff-47a0-8f00-5e8c1e8fb9de', '84038C3E-D715-4B34-A308-07A494C6F524', 1, 'jwt-resign-periodically', 'jwt-resign-periodically', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e6e60d33-01c1-4899-94c0-3981aabc86e3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e6e60d33-01c1-4899-94c0-3981aabc86e3', '84038C3E-D715-4B34-A308-07A494C6F524', 2, 'none', 'none', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7fc1de99-1816-4170-975f-705edc1d3d6d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7fc1de99-1816-4170-975f-705edc1d3d6d', '84038C3E-D715-4B34-A308-07A494C6F524', 3, 'oauth2-refresh', 'oauth2-refresh', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5bc8ae6e-0d25-405a-a65b-9d86e7f22a8b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5bc8ae6e-0d25-405a-a65b-9d86e7f22a8b', '84038C3E-D715-4B34-A308-07A494C6F524', 4, 'static-token', 'static-token', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 84038C3E-D715-4B34-A308-07A494C6F524 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='84038C3E-D715-4B34-A308-07A494C6F524';

/* SQL text to insert entity field value with ID b8450434-bf4b-45f3-b22f-9de3c9446222 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b8450434-bf4b-45f3-b22f-9de3c9446222', 'C36D32E4-2566-4218-B7F6-384E2E4745F3', 1, 'authorization-bearer', 'authorization-bearer', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 00ce59b7-d94f-4bd5-b163-fcddfb52920c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('00ce59b7-d94f-4bd5-b163-fcddfb52920c', 'C36D32E4-2566-4218-B7F6-384E2E4745F3', 2, 'custom-header', 'custom-header', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9e6bff24-43ca-47ef-81db-c55b6c61542b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9e6bff24-43ca-47ef-81db-c55b6c61542b', 'C36D32E4-2566-4218-B7F6-384E2E4745F3', 3, 'none-uses-query', 'none-uses-query', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 27465f65-2a32-4090-a153-4c3ca9a09ca3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('27465f65-2a32-4090-a153-4c3ca9a09ca3', 'C36D32E4-2566-4218-B7F6-384E2E4745F3', 4, 'x-api-key', 'x-api-key', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C36D32E4-2566-4218-B7F6-384E2E4745F3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C36D32E4-2566-4218-B7F6-384E2E4745F3';

/* SQL text to insert entity field value with ID ecb7ef7b-be10-40da-88ac-832ff1f73c0c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ecb7ef7b-be10-40da-88ac-832ff1f73c0c', 'A60DD467-81D1-415B-B6E7-342FD69F5C97', 1, 'custom', 'custom', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID eeec3930-ba1c-4830-9e94-06439f5255dc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eeec3930-ba1c-4830-9e94-06439f5255dc', 'A60DD467-81D1-415B-B6E7-342FD69F5C97', 2, 'envelope-with-error-field', 'envelope-with-error-field', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 95983633-ca43-406b-a196-dd75a6859805 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('95983633-ca43-406b-a196-dd75a6859805', 'A60DD467-81D1-415B-B6E7-342FD69F5C97', 3, 'http-status-only', 'http-status-only', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3026a1c3-54e2-47d0-a810-3f96a02204f6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3026a1c3-54e2-47d0-a810-3f96a02204f6', 'A60DD467-81D1-415B-B6E7-342FD69F5C97', 4, 'json-errors-array', 'json-errors-array', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A60DD467-81D1-415B-B6E7-342FD69F5C97 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A60DD467-81D1-415B-B6E7-342FD69F5C97';

/* SQL text to insert entity field value with ID a480e478-3776-460d-9832-81322ce2b409 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a480e478-3776-460d-9832-81322ce2b409', '7426E673-7939-41E5-8521-B2F6CD753367', 1, 'global-query-param', 'global-query-param', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID db3eaf17-1b14-48d1-b115-3100e004b4eb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('db3eaf17-1b14-48d1-b115-3100e004b4eb', '7426E673-7939-41E5-8521-B2F6CD753367', 2, 'none', 'none', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ff67eaf8-7bb2-4e13-bb52-c646bff516be */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ff67eaf8-7bb2-4e13-bb52-c646bff516be', '7426E673-7939-41E5-8521-B2F6CD753367', 3, 'per-resource-query-param', 'per-resource-query-param', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID affff89e-daeb-4c4d-9c41-cf9bd9ec78ae */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('affff89e-daeb-4c4d-9c41-cf9bd9ec78ae', '7426E673-7939-41E5-8521-B2F6CD753367', 4, 'polling-only', 'polling-only', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3caf7d8a-cca6-423c-b396-7a9e927d67f3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3caf7d8a-cca6-423c-b396-7a9e927d67f3', '7426E673-7939-41E5-8521-B2F6CD753367', 5, 'webhook-only', 'webhook-only', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7426E673-7939-41E5-8521-B2F6CD753367 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7426E673-7939-41E5-8521-B2F6CD753367';

/* SQL text to insert entity field value with ID 86f77da7-d710-4293-9178-453a13f2910d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('86f77da7-d710-4293-9178-453a13f2910d', '87AFC5A8-726A-4A90-BD55-E6E3C9DC453E', 1, 'ISO8601', 'ISO8601', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 45ff778f-8abe-4bf6-be46-c45625401504 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('45ff778f-8abe-4bf6-be46-c45625401504', '87AFC5A8-726A-4A90-BD55-E6E3C9DC453E', 2, 'epoch-seconds', 'epoch-seconds', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1804d3ee-b6c6-44d0-b06e-0326363936a0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1804d3ee-b6c6-44d0-b06e-0326363936a0', '87AFC5A8-726A-4A90-BD55-E6E3C9DC453E', 3, 'opaque-cursor', 'opaque-cursor', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 87AFC5A8-726A-4A90-BD55-E6E3C9DC453E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='87AFC5A8-726A-4A90-BD55-E6E3C9DC453E';

/* SQL text to insert entity field value with ID b9637b8b-ba0e-4517-83d6-e5980d469b3e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b9637b8b-ba0e-4517-83d6-e5980d469b3e', '102907CD-C809-41E6-AECF-390626EED0C0', 1, 'hmac-sha256', 'hmac-sha256', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6bd7302f-b1e8-4153-a115-f8f5935e4e98 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6bd7302f-b1e8-4153-a115-f8f5935e4e98', '102907CD-C809-41E6-AECF-390626EED0C0', 2, 'hmac-sha512', 'hmac-sha512', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a7e80579-7c5e-4b44-aa97-7f1b70a9d6a9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a7e80579-7c5e-4b44-aa97-7f1b70a9d6a9', '102907CD-C809-41E6-AECF-390626EED0C0', 3, 'none', 'none', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 42996bf6-f566-4b1f-8daf-15869ee2d666 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('42996bf6-f566-4b1f-8daf-15869ee2d666', '102907CD-C809-41E6-AECF-390626EED0C0', 4, 'rsa', 'rsa', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 102907CD-C809-41E6-AECF-390626EED0C0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='102907CD-C809-41E6-AECF-390626EED0C0';

/* SQL text to insert entity field value with ID 93db4fd9-4fa3-47ec-ba6b-c47f2ea2d87b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('93db4fd9-4fa3-47ec-ba6b-c47f2ea2d87b', '5010472A-801B-4346-B2B6-73DA6ABB23FE', 1, 'header', 'header', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0f4360cc-fa87-4ac5-9ff7-baa8c57d421d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0f4360cc-fa87-4ac5-9ff7-baa8c57d421d', '5010472A-801B-4346-B2B6-73DA6ABB23FE', 2, 'none', 'none', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 499f7d7f-5a71-4cd0-8eaa-c13bb1f62793 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('499f7d7f-5a71-4cd0-8eaa-c13bb1f62793', '5010472A-801B-4346-B2B6-73DA6ABB23FE', 3, 'path', 'path', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4f5503b9-fc57-4255-8883-a0a4f1cfd97c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4f5503b9-fc57-4255-8883-a0a4f1cfd97c', '5010472A-801B-4346-B2B6-73DA6ABB23FE', 4, 'query', 'query', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5010472A-801B-4346-B2B6-73DA6ABB23FE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5010472A-801B-4346-B2B6-73DA6ABB23FE';

/* SQL text to insert entity field value with ID 4030e620-de0d-4855-9f09-50882a67f8ad */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4030e620-de0d-4855-9f09-50882a67f8ad', 'E2FD39A5-EB10-4F38-95EF-7766A4BB9DC4', 1, 'attribute-flagged', 'attribute-flagged', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cb8cb0ea-bc5e-4536-8ee0-2e5d46f0f4aa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cb8cb0ea-bc5e-4536-8ee0-2e5d46f0f4aa', 'E2FD39A5-EB10-4F38-95EF-7766A4BB9DC4', 2, 'hubspot-customProperties-namespace', 'hubspot-customProperties-namespace', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fd647ec6-8c67-43c5-84db-a6454a525012 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fd647ec6-8c67-43c5-84db-a6454a525012', 'E2FD39A5-EB10-4F38-95EF-7766A4BB9DC4', 3, 'none', 'none', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 78ee5a43-2085-414c-82ab-1432f348f8d4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('78ee5a43-2085-414c-82ab-1432f348f8d4', 'E2FD39A5-EB10-4F38-95EF-7766A4BB9DC4', 4, 'prefix-based', 'prefix-based', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8da2f643-ed09-4780-8807-29b04c332037 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8da2f643-ed09-4780-8807-29b04c332037', 'E2FD39A5-EB10-4F38-95EF-7766A4BB9DC4', 5, 'salesforce-double-underscore-c', 'salesforce-double-underscore-c', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E2FD39A5-EB10-4F38-95EF-7766A4BB9DC4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E2FD39A5-EB10-4F38-95EF-7766A4BB9DC4';

/* SQL text to insert entity field value with ID 085bc855-2c57-48c5-86e5-cd27b3b2f9cc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('085bc855-2c57-48c5-86e5-cd27b3b2f9cc', 'F5C5AC44-82C0-441B-B864-D7C252144A1B', 1, 'camelCase-Id-suffix', 'camelCase-Id-suffix', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a66c5c9e-7dfc-4e98-8f3b-d5ecb9e2a1d2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a66c5c9e-7dfc-4e98-8f3b-d5ecb9e2a1d2', 'F5C5AC44-82C0-441B-B864-D7C252144A1B', 2, 'none', 'none', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b44949a4-4986-41cb-beb0-55d9d3aa77a5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b44949a4-4986-41cb-beb0-55d9d3aa77a5', 'F5C5AC44-82C0-441B-B864-D7C252144A1B', 3, 'object-named', 'object-named', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4bf7ebb1-d6c8-40b2-a4a5-64321d6207c6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4bf7ebb1-d6c8-40b2-a4a5-64321d6207c6', 'F5C5AC44-82C0-441B-B864-D7C252144A1B', 4, 'snake-case-id-suffix', 'snake-case-id-suffix', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 59e8c15b-35ff-496d-88d8-ebb24fcd5088 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('59e8c15b-35ff-496d-88d8-ebb24fcd5088', 'F5C5AC44-82C0-441B-B864-D7C252144A1B', 5, 'vendor-specific', 'vendor-specific', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F5C5AC44-82C0-441B-B864-D7C252144A1B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F5C5AC44-82C0-441B-B864-D7C252144A1B';

/* SQL text to insert entity field value with ID 6e2a9258-03cb-4485-90fc-10d726d8f012 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6e2a9258-03cb-4485-90fc-10d726d8f012', '188245DF-68AD-4478-A061-ABEBDC56D2E6', 1, 'ChangeToken', 'ChangeToken', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f438a01e-1b76-4a3a-8bc2-e7b8e2389f0c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f438a01e-1b76-4a3a-8bc2-e7b8e2389f0c', '188245DF-68AD-4478-A061-ABEBDC56D2E6', 2, 'Cursor', 'Cursor', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7375924f-4d69-4a2d-b2c9-9f46695b4e12 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7375924f-4d69-4a2d-b2c9-9f46695b4e12', '188245DF-68AD-4478-A061-ABEBDC56D2E6', 3, 'Timestamp', 'Timestamp', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e54f8ec4-570d-4cf8-ae4c-2b0402315af0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e54f8ec4-570d-4cf8-ae4c-2b0402315af0', '188245DF-68AD-4478-A061-ABEBDC56D2E6', 4, 'Version', 'Version', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 188245DF-68AD-4478-A061-ABEBDC56D2E6 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='188245DF-68AD-4478-A061-ABEBDC56D2E6';

/* SQL text to insert entity field value with ID 8c739d16-9d96-43c1-afeb-8a14192b236a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8c739d16-9d96-43c1-afeb-8a14192b236a', '21CF89B7-1A6F-48ED-BF37-523F76175ED4', 1, 'DELETE', 'DELETE', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 476ca2ed-cae7-4145-b599-45ce2c736ba5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('476ca2ed-cae7-4145-b599-45ce2c736ba5', '21CF89B7-1A6F-48ED-BF37-523F76175ED4', 2, 'GET', 'GET', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID af345315-52ce-4d2c-b99b-f091c043609a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('af345315-52ce-4d2c-b99b-f091c043609a', '21CF89B7-1A6F-48ED-BF37-523F76175ED4', 3, 'PATCH', 'PATCH', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 52ad9321-5593-491a-acc1-4c9cea2134c6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('52ad9321-5593-491a-acc1-4c9cea2134c6', '21CF89B7-1A6F-48ED-BF37-523F76175ED4', 4, 'POST', 'POST', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e464dd6e-5bca-4c1e-8381-2b0ffd6532a6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e464dd6e-5bca-4c1e-8381-2b0ffd6532a6', '21CF89B7-1A6F-48ED-BF37-523F76175ED4', 5, 'PUT', 'PUT', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 21CF89B7-1A6F-48ED-BF37-523F76175ED4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='21CF89B7-1A6F-48ED-BF37-523F76175ED4';

/* SQL text to insert entity field value with ID c533f1b0-04ef-45e8-941b-587ae7f1eee2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c533f1b0-04ef-45e8-941b-587ae7f1eee2', '44B0A561-C005-4CF7-A7FC-5AFCE27CCC44', 1, 'name-pattern-suffix', 'name-pattern-suffix', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d9082f33-255b-4a64-9152-94d1ee343670 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d9082f33-255b-4a64-9152-94d1ee343670', '44B0A561-C005-4CF7-A7FC-5AFCE27CCC44', 2, 'openapi-ref', 'openapi-ref', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID aa611229-80d6-4d11-bb5a-64d5d169e218 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('aa611229-80d6-4d11-bb5a-64d5d169e218', '44B0A561-C005-4CF7-A7FC-5AFCE27CCC44', 3, 'sdk-relationship-annotation', 'sdk-relationship-annotation', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 95907d1c-4c3d-417c-988c-b8f77fdffdeb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('95907d1c-4c3d-417c-988c-b8f77fdffdeb', '44B0A561-C005-4CF7-A7FC-5AFCE27CCC44', 4, 'unknown', 'unknown', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a2e2137e-d68c-4a80-9bd7-d356bcda6b15 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a2e2137e-d68c-4a80-9bd7-d356bcda6b15', '44B0A561-C005-4CF7-A7FC-5AFCE27CCC44', 5, 'url-path-parent', 'url-path-parent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 75e3cfdc-061c-48e2-965c-3eb11cb3e29d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('75e3cfdc-061c-48e2-965c-3eb11cb3e29d', '44B0A561-C005-4CF7-A7FC-5AFCE27CCC44', 6, 'vendor-specific', 'vendor-specific', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 44B0A561-C005-4CF7-A7FC-5AFCE27CCC44 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='44B0A561-C005-4CF7-A7FC-5AFCE27CCC44';

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
    @Source nvarchar(20) = NULL,
    @IsAPIWritable bit = NULL,
    @IsComputed bit = NULL,
    @IsImmutableAfterCreate bit = NULL,
    @IsCustomField bit = NULL,
    @IsIncrementalCursorCandidate bit = NULL,
    @IsForeignKey bit = NULL,
    @FKDetectionMethod_Clear bit = 0,
    @FKDetectionMethod nvarchar(50) = NULL,
    @IsDeprecated bit = NULL
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
                [Source],
                [IsAPIWritable],
                [IsComputed],
                [IsImmutableAfterCreate],
                [IsCustomField],
                [IsIncrementalCursorCandidate],
                [IsForeignKey],
                [FKDetectionMethod],
                [IsDeprecated]
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
                ISNULL(@Source, 'Declared'),
                ISNULL(@IsAPIWritable, 0),
                ISNULL(@IsComputed, 0),
                ISNULL(@IsImmutableAfterCreate, 0),
                ISNULL(@IsCustomField, 0),
                ISNULL(@IsIncrementalCursorCandidate, 0),
                ISNULL(@IsForeignKey, 0),
                CASE WHEN @FKDetectionMethod_Clear = 1 THEN NULL ELSE ISNULL(@FKDetectionMethod, NULL) END,
                ISNULL(@IsDeprecated, 0)
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
                [Source],
                [IsAPIWritable],
                [IsComputed],
                [IsImmutableAfterCreate],
                [IsCustomField],
                [IsIncrementalCursorCandidate],
                [IsForeignKey],
                [FKDetectionMethod],
                [IsDeprecated]
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
                ISNULL(@Source, 'Declared'),
                ISNULL(@IsAPIWritable, 0),
                ISNULL(@IsComputed, 0),
                ISNULL(@IsImmutableAfterCreate, 0),
                ISNULL(@IsCustomField, 0),
                ISNULL(@IsIncrementalCursorCandidate, 0),
                ISNULL(@IsForeignKey, 0),
                CASE WHEN @FKDetectionMethod_Clear = 1 THEN NULL ELSE ISNULL(@FKDetectionMethod, NULL) END,
                ISNULL(@IsDeprecated, 0)
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
    @Source nvarchar(20) = NULL,
    @IsAPIWritable bit = NULL,
    @IsComputed bit = NULL,
    @IsImmutableAfterCreate bit = NULL,
    @IsCustomField bit = NULL,
    @IsIncrementalCursorCandidate bit = NULL,
    @IsForeignKey bit = NULL,
    @FKDetectionMethod_Clear bit = 0,
    @FKDetectionMethod nvarchar(50) = NULL,
    @IsDeprecated bit = NULL
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
        [Source] = ISNULL(@Source, [Source]),
        [IsAPIWritable] = ISNULL(@IsAPIWritable, [IsAPIWritable]),
        [IsComputed] = ISNULL(@IsComputed, [IsComputed]),
        [IsImmutableAfterCreate] = ISNULL(@IsImmutableAfterCreate, [IsImmutableAfterCreate]),
        [IsCustomField] = ISNULL(@IsCustomField, [IsCustomField]),
        [IsIncrementalCursorCandidate] = ISNULL(@IsIncrementalCursorCandidate, [IsIncrementalCursorCandidate]),
        [IsForeignKey] = ISNULL(@IsForeignKey, [IsForeignKey]),
        [FKDetectionMethod] = CASE WHEN @FKDetectionMethod_Clear = 1 THEN NULL ELSE ISNULL(@FKDetectionMethod, [FKDetectionMethod]) END,
        [IsDeprecated] = ISNULL(@IsDeprecated, [IsDeprecated])
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
    @CreateAPIPath nvarchar(500) = NULL,
    @CreateMethod_Clear bit = 0,
    @CreateMethod nvarchar(10) = NULL,
    @UpdateAPIPath_Clear bit = 0,
    @UpdateAPIPath nvarchar(500) = NULL,
    @UpdateMethod_Clear bit = 0,
    @UpdateMethod nvarchar(10) = NULL,
    @DeleteAPIPath_Clear bit = 0,
    @DeleteAPIPath nvarchar(500) = NULL,
    @GetAPIPath_Clear bit = 0,
    @GetAPIPath nvarchar(500) = NULL,
    @GetMethod_Clear bit = 0,
    @GetMethod nvarchar(10) = NULL,
    @SearchAPIPath_Clear bit = 0,
    @SearchAPIPath nvarchar(500) = NULL,
    @SearchMethod_Clear bit = 0,
    @SearchMethod nvarchar(10) = NULL,
    @ListAPIPath_Clear bit = 0,
    @ListAPIPath nvarchar(500) = NULL,
    @ListMethod_Clear bit = 0,
    @ListMethod nvarchar(10) = NULL,
    @Source nvarchar(20) = NULL,
    @IncludeInActionGeneration bit = NULL,
    @IsBidirectional bit = NULL,
    @ParentObjectName_Clear bit = 0,
    @ParentObjectName nvarchar(255) = NULL,
    @ParentObjectIDFieldName_Clear bit = 0,
    @ParentObjectIDFieldName nvarchar(255) = NULL,
    @IncrementalCursorFieldName_Clear bit = 0,
    @IncrementalCursorFieldName nvarchar(255) = NULL,
    @IncrementalWatermarkType_Clear bit = 0,
    @IncrementalWatermarkType nvarchar(50) = NULL,
    @IsStandardObject bit = NULL,
    @IsCustomObject bit = NULL,
    @BulkAPIPath_Clear bit = 0,
    @BulkAPIPath nvarchar(500) = NULL,
    @BulkAPIMethod_Clear bit = 0,
    @BulkAPIMethod nvarchar(10) = NULL
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
                [UpdateAPIPath],
                [UpdateMethod],
                [DeleteAPIPath],
                [GetAPIPath],
                [GetMethod],
                [SearchAPIPath],
                [SearchMethod],
                [ListAPIPath],
                [ListMethod],
                [Source],
                [IncludeInActionGeneration],
                [IsBidirectional],
                [ParentObjectName],
                [ParentObjectIDFieldName],
                [IncrementalCursorFieldName],
                [IncrementalWatermarkType],
                [IsStandardObject],
                [IsCustomObject],
                [BulkAPIPath],
                [BulkAPIMethod]
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
                CASE WHEN @UpdateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@UpdateAPIPath, NULL) END,
                CASE WHEN @UpdateMethod_Clear = 1 THEN NULL ELSE ISNULL(@UpdateMethod, NULL) END,
                CASE WHEN @DeleteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@DeleteAPIPath, NULL) END,
                CASE WHEN @GetAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@GetAPIPath, NULL) END,
                CASE WHEN @GetMethod_Clear = 1 THEN NULL ELSE ISNULL(@GetMethod, NULL) END,
                CASE WHEN @SearchAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@SearchAPIPath, NULL) END,
                CASE WHEN @SearchMethod_Clear = 1 THEN NULL ELSE ISNULL(@SearchMethod, NULL) END,
                CASE WHEN @ListAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@ListAPIPath, NULL) END,
                CASE WHEN @ListMethod_Clear = 1 THEN NULL ELSE ISNULL(@ListMethod, NULL) END,
                ISNULL(@Source, 'Declared'),
                ISNULL(@IncludeInActionGeneration, 1),
                ISNULL(@IsBidirectional, 0),
                CASE WHEN @ParentObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ParentObjectName, NULL) END,
                CASE WHEN @ParentObjectIDFieldName_Clear = 1 THEN NULL ELSE ISNULL(@ParentObjectIDFieldName, NULL) END,
                CASE WHEN @IncrementalCursorFieldName_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalCursorFieldName, NULL) END,
                CASE WHEN @IncrementalWatermarkType_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalWatermarkType, NULL) END,
                ISNULL(@IsStandardObject, 1),
                ISNULL(@IsCustomObject, 0),
                CASE WHEN @BulkAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@BulkAPIPath, NULL) END,
                CASE WHEN @BulkAPIMethod_Clear = 1 THEN NULL ELSE ISNULL(@BulkAPIMethod, NULL) END
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
                [UpdateAPIPath],
                [UpdateMethod],
                [DeleteAPIPath],
                [GetAPIPath],
                [GetMethod],
                [SearchAPIPath],
                [SearchMethod],
                [ListAPIPath],
                [ListMethod],
                [Source],
                [IncludeInActionGeneration],
                [IsBidirectional],
                [ParentObjectName],
                [ParentObjectIDFieldName],
                [IncrementalCursorFieldName],
                [IncrementalWatermarkType],
                [IsStandardObject],
                [IsCustomObject],
                [BulkAPIPath],
                [BulkAPIMethod]
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
                CASE WHEN @UpdateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@UpdateAPIPath, NULL) END,
                CASE WHEN @UpdateMethod_Clear = 1 THEN NULL ELSE ISNULL(@UpdateMethod, NULL) END,
                CASE WHEN @DeleteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@DeleteAPIPath, NULL) END,
                CASE WHEN @GetAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@GetAPIPath, NULL) END,
                CASE WHEN @GetMethod_Clear = 1 THEN NULL ELSE ISNULL(@GetMethod, NULL) END,
                CASE WHEN @SearchAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@SearchAPIPath, NULL) END,
                CASE WHEN @SearchMethod_Clear = 1 THEN NULL ELSE ISNULL(@SearchMethod, NULL) END,
                CASE WHEN @ListAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@ListAPIPath, NULL) END,
                CASE WHEN @ListMethod_Clear = 1 THEN NULL ELSE ISNULL(@ListMethod, NULL) END,
                ISNULL(@Source, 'Declared'),
                ISNULL(@IncludeInActionGeneration, 1),
                ISNULL(@IsBidirectional, 0),
                CASE WHEN @ParentObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ParentObjectName, NULL) END,
                CASE WHEN @ParentObjectIDFieldName_Clear = 1 THEN NULL ELSE ISNULL(@ParentObjectIDFieldName, NULL) END,
                CASE WHEN @IncrementalCursorFieldName_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalCursorFieldName, NULL) END,
                CASE WHEN @IncrementalWatermarkType_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalWatermarkType, NULL) END,
                ISNULL(@IsStandardObject, 1),
                ISNULL(@IsCustomObject, 0),
                CASE WHEN @BulkAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@BulkAPIPath, NULL) END,
                CASE WHEN @BulkAPIMethod_Clear = 1 THEN NULL ELSE ISNULL(@BulkAPIMethod, NULL) END
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
    @CreateAPIPath nvarchar(500) = NULL,
    @CreateMethod_Clear bit = 0,
    @CreateMethod nvarchar(10) = NULL,
    @UpdateAPIPath_Clear bit = 0,
    @UpdateAPIPath nvarchar(500) = NULL,
    @UpdateMethod_Clear bit = 0,
    @UpdateMethod nvarchar(10) = NULL,
    @DeleteAPIPath_Clear bit = 0,
    @DeleteAPIPath nvarchar(500) = NULL,
    @GetAPIPath_Clear bit = 0,
    @GetAPIPath nvarchar(500) = NULL,
    @GetMethod_Clear bit = 0,
    @GetMethod nvarchar(10) = NULL,
    @SearchAPIPath_Clear bit = 0,
    @SearchAPIPath nvarchar(500) = NULL,
    @SearchMethod_Clear bit = 0,
    @SearchMethod nvarchar(10) = NULL,
    @ListAPIPath_Clear bit = 0,
    @ListAPIPath nvarchar(500) = NULL,
    @ListMethod_Clear bit = 0,
    @ListMethod nvarchar(10) = NULL,
    @Source nvarchar(20) = NULL,
    @IncludeInActionGeneration bit = NULL,
    @IsBidirectional bit = NULL,
    @ParentObjectName_Clear bit = 0,
    @ParentObjectName nvarchar(255) = NULL,
    @ParentObjectIDFieldName_Clear bit = 0,
    @ParentObjectIDFieldName nvarchar(255) = NULL,
    @IncrementalCursorFieldName_Clear bit = 0,
    @IncrementalCursorFieldName nvarchar(255) = NULL,
    @IncrementalWatermarkType_Clear bit = 0,
    @IncrementalWatermarkType nvarchar(50) = NULL,
    @IsStandardObject bit = NULL,
    @IsCustomObject bit = NULL,
    @BulkAPIPath_Clear bit = 0,
    @BulkAPIPath nvarchar(500) = NULL,
    @BulkAPIMethod_Clear bit = 0,
    @BulkAPIMethod nvarchar(10) = NULL
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
        [UpdateAPIPath] = CASE WHEN @UpdateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@UpdateAPIPath, [UpdateAPIPath]) END,
        [UpdateMethod] = CASE WHEN @UpdateMethod_Clear = 1 THEN NULL ELSE ISNULL(@UpdateMethod, [UpdateMethod]) END,
        [DeleteAPIPath] = CASE WHEN @DeleteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@DeleteAPIPath, [DeleteAPIPath]) END,
        [GetAPIPath] = CASE WHEN @GetAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@GetAPIPath, [GetAPIPath]) END,
        [GetMethod] = CASE WHEN @GetMethod_Clear = 1 THEN NULL ELSE ISNULL(@GetMethod, [GetMethod]) END,
        [SearchAPIPath] = CASE WHEN @SearchAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@SearchAPIPath, [SearchAPIPath]) END,
        [SearchMethod] = CASE WHEN @SearchMethod_Clear = 1 THEN NULL ELSE ISNULL(@SearchMethod, [SearchMethod]) END,
        [ListAPIPath] = CASE WHEN @ListAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@ListAPIPath, [ListAPIPath]) END,
        [ListMethod] = CASE WHEN @ListMethod_Clear = 1 THEN NULL ELSE ISNULL(@ListMethod, [ListMethod]) END,
        [Source] = ISNULL(@Source, [Source]),
        [IncludeInActionGeneration] = ISNULL(@IncludeInActionGeneration, [IncludeInActionGeneration]),
        [IsBidirectional] = ISNULL(@IsBidirectional, [IsBidirectional]),
        [ParentObjectName] = CASE WHEN @ParentObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ParentObjectName, [ParentObjectName]) END,
        [ParentObjectIDFieldName] = CASE WHEN @ParentObjectIDFieldName_Clear = 1 THEN NULL ELSE ISNULL(@ParentObjectIDFieldName, [ParentObjectIDFieldName]) END,
        [IncrementalCursorFieldName] = CASE WHEN @IncrementalCursorFieldName_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalCursorFieldName, [IncrementalCursorFieldName]) END,
        [IncrementalWatermarkType] = CASE WHEN @IncrementalWatermarkType_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalWatermarkType, [IncrementalWatermarkType]) END,
        [IsStandardObject] = ISNULL(@IsStandardObject, [IsStandardObject]),
        [IsCustomObject] = ISNULL(@IsCustomObject, [IsCustomObject]),
        [BulkAPIPath] = CASE WHEN @BulkAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@BulkAPIPath, [BulkAPIPath]) END,
        [BulkAPIMethod] = CASE WHEN @BulkAPIMethod_Clear = 1 THEN NULL ELSE ISNULL(@BulkAPIMethod, [BulkAPIMethod]) END
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObjectField] TO [cdp_Integration];

/* spDelete Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObjectField] TO [cdp_Integration];

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObject] TO [cdp_Integration];

/* spDelete Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObject] TO [cdp_Integration];

/* Index for Foreign Keys for Integration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialTypeID in table Integration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Integration_CredentialTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Integration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Integration_CredentialTypeID ON [${flyway:defaultSchema}].[Integration] ([CredentialTypeID]);

/* Base View SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: vwIntegrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integrations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Integration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrations]
AS
SELECT
    i.*,
    MJCredentialType_CredentialTypeID.[Name] AS [CredentialType]
FROM
    [${flyway:defaultSchema}].[Integration] AS i
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CredentialType] AS MJCredentialType_CredentialTypeID
  ON
    [i].[CredentialTypeID] = MJCredentialType_CredentialTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: Permissions for vwIntegrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spCreateIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Integration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegration]
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @NavigationBaseURL_Clear bit = 0,
    @NavigationBaseURL nvarchar(500) = NULL,
    @ClassName_Clear bit = 0,
    @ClassName nvarchar(100) = NULL,
    @ImportPath_Clear bit = 0,
    @ImportPath nvarchar(100) = NULL,
    @BatchMaxRequestCount int = NULL,
    @BatchRequestWaitTime int = NULL,
    @ID uniqueidentifier = NULL,
    @CredentialTypeID_Clear bit = 0,
    @CredentialTypeID uniqueidentifier = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(MAX) = NULL,
    @ActionIconClass_Clear bit = 0,
    @ActionIconClass nvarchar(200) = NULL,
    @ActionCategoryName_Clear bit = 0,
    @ActionCategoryName nvarchar(255) = NULL,
    @ActionCategoryDescription_Clear bit = 0,
    @ActionCategoryDescription nvarchar(MAX) = NULL,
    @ActionParentCategoryName_Clear bit = 0,
    @ActionParentCategoryName nvarchar(255) = NULL,
    @IncludeSearchActions bit = NULL,
    @IncludeListActions bit = NULL,
    @CreateActionCategory bit = NULL,
    @PrimaryKeyFieldName_Clear bit = 0,
    @PrimaryKeyFieldName nvarchar(100) = NULL,
    @PrimaryKeyFieldConfidence_Clear bit = 0,
    @PrimaryKeyFieldConfidence nvarchar(20) = NULL,
    @APIBaseURL_Clear bit = 0,
    @APIBaseURL nvarchar(500) = NULL,
    @APIBaseURLMode_Clear bit = 0,
    @APIBaseURLMode nvarchar(50) = NULL,
    @DynamicAPIBaseURLSourceField_Clear bit = 0,
    @DynamicAPIBaseURLSourceField nvarchar(100) = NULL,
    @TokenRefreshStrategy_Clear bit = 0,
    @TokenRefreshStrategy nvarchar(50) = NULL,
    @TokenTTLSeconds_Clear bit = 0,
    @TokenTTLSeconds int = NULL,
    @AuthHeaderPattern_Clear bit = 0,
    @AuthHeaderPattern nvarchar(50) = NULL,
    @CustomAuthHeaderName_Clear bit = 0,
    @CustomAuthHeaderName nvarchar(100) = NULL,
    @CredentialFieldSchemaJSON_Clear bit = 0,
    @CredentialFieldSchemaJSON nvarchar(MAX) = NULL,
    @PaginationCursorParamName_Clear bit = 0,
    @PaginationCursorParamName nvarchar(100) = NULL,
    @PaginationCursorResponsePath_Clear bit = 0,
    @PaginationCursorResponsePath nvarchar(200) = NULL,
    @PaginationLimitParamName_Clear bit = 0,
    @PaginationLimitParamName nvarchar(100) = NULL,
    @PaginationPageParamName_Clear bit = 0,
    @PaginationPageParamName nvarchar(100) = NULL,
    @PaginationOffsetParamName_Clear bit = 0,
    @PaginationOffsetParamName nvarchar(100) = NULL,
    @PaginationHasMoreResponsePath_Clear bit = 0,
    @PaginationHasMoreResponsePath nvarchar(200) = NULL,
    @PaginationTotalCountResponsePath_Clear bit = 0,
    @PaginationTotalCountResponsePath nvarchar(200) = NULL,
    @PaginationMaxPageSize_Clear bit = 0,
    @PaginationMaxPageSize int = NULL,
    @ErrorResponseShape_Clear bit = 0,
    @ErrorResponseShape nvarchar(50) = NULL,
    @ErrorMessageFieldPath_Clear bit = 0,
    @ErrorMessageFieldPath nvarchar(200) = NULL,
    @ErrorCodeFieldPath_Clear bit = 0,
    @ErrorCodeFieldPath nvarchar(200) = NULL,
    @IncrementalSyncCapability_Clear bit = 0,
    @IncrementalSyncCapability nvarchar(50) = NULL,
    @IncrementalQueryParamName_Clear bit = 0,
    @IncrementalQueryParamName nvarchar(100) = NULL,
    @IncrementalQueryParamFormat_Clear bit = 0,
    @IncrementalQueryParamFormat nvarchar(50) = NULL,
    @WebhooksAvailable bit = NULL,
    @WebhookSubscriptionAPIPath_Clear bit = 0,
    @WebhookSubscriptionAPIPath nvarchar(500) = NULL,
    @WebhookSignatureHeaderName_Clear bit = 0,
    @WebhookSignatureHeaderName nvarchar(100) = NULL,
    @WebhookSignatureAlgorithm_Clear bit = 0,
    @WebhookSignatureAlgorithm nvarchar(50) = NULL,
    @BulkOperationsAvailable bit = NULL,
    @APIVersioningStrategy_Clear bit = 0,
    @APIVersioningStrategy nvarchar(50) = NULL,
    @APIVersion_Clear bit = 0,
    @APIVersion nvarchar(50) = NULL,
    @IdempotencyHeaderName_Clear bit = 0,
    @IdempotencyHeaderName nvarchar(100) = NULL,
    @CustomObjectMarkerPattern_Clear bit = 0,
    @CustomObjectMarkerPattern nvarchar(100) = NULL,
    @CustomFieldMarkerPattern_Clear bit = 0,
    @CustomFieldMarkerPattern nvarchar(100) = NULL,
    @FKNamingConvention_Clear bit = 0,
    @FKNamingConvention nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Integration]
            (
                [ID],
                [Name],
                [Description],
                [NavigationBaseURL],
                [ClassName],
                [ImportPath],
                [BatchMaxRequestCount],
                [BatchRequestWaitTime],
                [CredentialTypeID],
                [Icon],
                [ActionIconClass],
                [ActionCategoryName],
                [ActionCategoryDescription],
                [ActionParentCategoryName],
                [IncludeSearchActions],
                [IncludeListActions],
                [CreateActionCategory],
                [PrimaryKeyFieldName],
                [PrimaryKeyFieldConfidence],
                [APIBaseURL],
                [APIBaseURLMode],
                [DynamicAPIBaseURLSourceField],
                [TokenRefreshStrategy],
                [TokenTTLSeconds],
                [AuthHeaderPattern],
                [CustomAuthHeaderName],
                [CredentialFieldSchemaJSON],
                [PaginationCursorParamName],
                [PaginationCursorResponsePath],
                [PaginationLimitParamName],
                [PaginationPageParamName],
                [PaginationOffsetParamName],
                [PaginationHasMoreResponsePath],
                [PaginationTotalCountResponsePath],
                [PaginationMaxPageSize],
                [ErrorResponseShape],
                [ErrorMessageFieldPath],
                [ErrorCodeFieldPath],
                [IncrementalSyncCapability],
                [IncrementalQueryParamName],
                [IncrementalQueryParamFormat],
                [WebhooksAvailable],
                [WebhookSubscriptionAPIPath],
                [WebhookSignatureHeaderName],
                [WebhookSignatureAlgorithm],
                [BulkOperationsAvailable],
                [APIVersioningStrategy],
                [APIVersion],
                [IdempotencyHeaderName],
                [CustomObjectMarkerPattern],
                [CustomFieldMarkerPattern],
                [FKNamingConvention]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @NavigationBaseURL_Clear = 1 THEN NULL ELSE ISNULL(@NavigationBaseURL, NULL) END,
                CASE WHEN @ClassName_Clear = 1 THEN NULL ELSE ISNULL(@ClassName, NULL) END,
                CASE WHEN @ImportPath_Clear = 1 THEN NULL ELSE ISNULL(@ImportPath, NULL) END,
                ISNULL(@BatchMaxRequestCount, -1),
                ISNULL(@BatchRequestWaitTime, -1),
                CASE WHEN @CredentialTypeID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialTypeID, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @ActionIconClass_Clear = 1 THEN NULL ELSE ISNULL(@ActionIconClass, NULL) END,
                CASE WHEN @ActionCategoryName_Clear = 1 THEN NULL ELSE ISNULL(@ActionCategoryName, NULL) END,
                CASE WHEN @ActionCategoryDescription_Clear = 1 THEN NULL ELSE ISNULL(@ActionCategoryDescription, NULL) END,
                CASE WHEN @ActionParentCategoryName_Clear = 1 THEN NULL ELSE ISNULL(@ActionParentCategoryName, NULL) END,
                ISNULL(@IncludeSearchActions, 1),
                ISNULL(@IncludeListActions, 1),
                ISNULL(@CreateActionCategory, 1),
                CASE WHEN @PrimaryKeyFieldName_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryKeyFieldName, NULL) END,
                CASE WHEN @PrimaryKeyFieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryKeyFieldConfidence, NULL) END,
                CASE WHEN @APIBaseURL_Clear = 1 THEN NULL ELSE ISNULL(@APIBaseURL, NULL) END,
                CASE WHEN @APIBaseURLMode_Clear = 1 THEN NULL ELSE ISNULL(@APIBaseURLMode, NULL) END,
                CASE WHEN @DynamicAPIBaseURLSourceField_Clear = 1 THEN NULL ELSE ISNULL(@DynamicAPIBaseURLSourceField, NULL) END,
                CASE WHEN @TokenRefreshStrategy_Clear = 1 THEN NULL ELSE ISNULL(@TokenRefreshStrategy, NULL) END,
                CASE WHEN @TokenTTLSeconds_Clear = 1 THEN NULL ELSE ISNULL(@TokenTTLSeconds, NULL) END,
                CASE WHEN @AuthHeaderPattern_Clear = 1 THEN NULL ELSE ISNULL(@AuthHeaderPattern, NULL) END,
                CASE WHEN @CustomAuthHeaderName_Clear = 1 THEN NULL ELSE ISNULL(@CustomAuthHeaderName, NULL) END,
                CASE WHEN @CredentialFieldSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@CredentialFieldSchemaJSON, NULL) END,
                CASE WHEN @PaginationCursorParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationCursorParamName, NULL) END,
                CASE WHEN @PaginationCursorResponsePath_Clear = 1 THEN NULL ELSE ISNULL(@PaginationCursorResponsePath, NULL) END,
                CASE WHEN @PaginationLimitParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationLimitParamName, NULL) END,
                CASE WHEN @PaginationPageParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationPageParamName, NULL) END,
                CASE WHEN @PaginationOffsetParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationOffsetParamName, NULL) END,
                CASE WHEN @PaginationHasMoreResponsePath_Clear = 1 THEN NULL ELSE ISNULL(@PaginationHasMoreResponsePath, NULL) END,
                CASE WHEN @PaginationTotalCountResponsePath_Clear = 1 THEN NULL ELSE ISNULL(@PaginationTotalCountResponsePath, NULL) END,
                CASE WHEN @PaginationMaxPageSize_Clear = 1 THEN NULL ELSE ISNULL(@PaginationMaxPageSize, NULL) END,
                CASE WHEN @ErrorResponseShape_Clear = 1 THEN NULL ELSE ISNULL(@ErrorResponseShape, NULL) END,
                CASE WHEN @ErrorMessageFieldPath_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessageFieldPath, NULL) END,
                CASE WHEN @ErrorCodeFieldPath_Clear = 1 THEN NULL ELSE ISNULL(@ErrorCodeFieldPath, NULL) END,
                CASE WHEN @IncrementalSyncCapability_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalSyncCapability, NULL) END,
                CASE WHEN @IncrementalQueryParamName_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalQueryParamName, NULL) END,
                CASE WHEN @IncrementalQueryParamFormat_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalQueryParamFormat, NULL) END,
                ISNULL(@WebhooksAvailable, 0),
                CASE WHEN @WebhookSubscriptionAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@WebhookSubscriptionAPIPath, NULL) END,
                CASE WHEN @WebhookSignatureHeaderName_Clear = 1 THEN NULL ELSE ISNULL(@WebhookSignatureHeaderName, NULL) END,
                CASE WHEN @WebhookSignatureAlgorithm_Clear = 1 THEN NULL ELSE ISNULL(@WebhookSignatureAlgorithm, NULL) END,
                ISNULL(@BulkOperationsAvailable, 0),
                CASE WHEN @APIVersioningStrategy_Clear = 1 THEN NULL ELSE ISNULL(@APIVersioningStrategy, NULL) END,
                CASE WHEN @APIVersion_Clear = 1 THEN NULL ELSE ISNULL(@APIVersion, NULL) END,
                CASE WHEN @IdempotencyHeaderName_Clear = 1 THEN NULL ELSE ISNULL(@IdempotencyHeaderName, NULL) END,
                CASE WHEN @CustomObjectMarkerPattern_Clear = 1 THEN NULL ELSE ISNULL(@CustomObjectMarkerPattern, NULL) END,
                CASE WHEN @CustomFieldMarkerPattern_Clear = 1 THEN NULL ELSE ISNULL(@CustomFieldMarkerPattern, NULL) END,
                CASE WHEN @FKNamingConvention_Clear = 1 THEN NULL ELSE ISNULL(@FKNamingConvention, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Integration]
            (
                [Name],
                [Description],
                [NavigationBaseURL],
                [ClassName],
                [ImportPath],
                [BatchMaxRequestCount],
                [BatchRequestWaitTime],
                [CredentialTypeID],
                [Icon],
                [ActionIconClass],
                [ActionCategoryName],
                [ActionCategoryDescription],
                [ActionParentCategoryName],
                [IncludeSearchActions],
                [IncludeListActions],
                [CreateActionCategory],
                [PrimaryKeyFieldName],
                [PrimaryKeyFieldConfidence],
                [APIBaseURL],
                [APIBaseURLMode],
                [DynamicAPIBaseURLSourceField],
                [TokenRefreshStrategy],
                [TokenTTLSeconds],
                [AuthHeaderPattern],
                [CustomAuthHeaderName],
                [CredentialFieldSchemaJSON],
                [PaginationCursorParamName],
                [PaginationCursorResponsePath],
                [PaginationLimitParamName],
                [PaginationPageParamName],
                [PaginationOffsetParamName],
                [PaginationHasMoreResponsePath],
                [PaginationTotalCountResponsePath],
                [PaginationMaxPageSize],
                [ErrorResponseShape],
                [ErrorMessageFieldPath],
                [ErrorCodeFieldPath],
                [IncrementalSyncCapability],
                [IncrementalQueryParamName],
                [IncrementalQueryParamFormat],
                [WebhooksAvailable],
                [WebhookSubscriptionAPIPath],
                [WebhookSignatureHeaderName],
                [WebhookSignatureAlgorithm],
                [BulkOperationsAvailable],
                [APIVersioningStrategy],
                [APIVersion],
                [IdempotencyHeaderName],
                [CustomObjectMarkerPattern],
                [CustomFieldMarkerPattern],
                [FKNamingConvention]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @NavigationBaseURL_Clear = 1 THEN NULL ELSE ISNULL(@NavigationBaseURL, NULL) END,
                CASE WHEN @ClassName_Clear = 1 THEN NULL ELSE ISNULL(@ClassName, NULL) END,
                CASE WHEN @ImportPath_Clear = 1 THEN NULL ELSE ISNULL(@ImportPath, NULL) END,
                ISNULL(@BatchMaxRequestCount, -1),
                ISNULL(@BatchRequestWaitTime, -1),
                CASE WHEN @CredentialTypeID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialTypeID, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @ActionIconClass_Clear = 1 THEN NULL ELSE ISNULL(@ActionIconClass, NULL) END,
                CASE WHEN @ActionCategoryName_Clear = 1 THEN NULL ELSE ISNULL(@ActionCategoryName, NULL) END,
                CASE WHEN @ActionCategoryDescription_Clear = 1 THEN NULL ELSE ISNULL(@ActionCategoryDescription, NULL) END,
                CASE WHEN @ActionParentCategoryName_Clear = 1 THEN NULL ELSE ISNULL(@ActionParentCategoryName, NULL) END,
                ISNULL(@IncludeSearchActions, 1),
                ISNULL(@IncludeListActions, 1),
                ISNULL(@CreateActionCategory, 1),
                CASE WHEN @PrimaryKeyFieldName_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryKeyFieldName, NULL) END,
                CASE WHEN @PrimaryKeyFieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryKeyFieldConfidence, NULL) END,
                CASE WHEN @APIBaseURL_Clear = 1 THEN NULL ELSE ISNULL(@APIBaseURL, NULL) END,
                CASE WHEN @APIBaseURLMode_Clear = 1 THEN NULL ELSE ISNULL(@APIBaseURLMode, NULL) END,
                CASE WHEN @DynamicAPIBaseURLSourceField_Clear = 1 THEN NULL ELSE ISNULL(@DynamicAPIBaseURLSourceField, NULL) END,
                CASE WHEN @TokenRefreshStrategy_Clear = 1 THEN NULL ELSE ISNULL(@TokenRefreshStrategy, NULL) END,
                CASE WHEN @TokenTTLSeconds_Clear = 1 THEN NULL ELSE ISNULL(@TokenTTLSeconds, NULL) END,
                CASE WHEN @AuthHeaderPattern_Clear = 1 THEN NULL ELSE ISNULL(@AuthHeaderPattern, NULL) END,
                CASE WHEN @CustomAuthHeaderName_Clear = 1 THEN NULL ELSE ISNULL(@CustomAuthHeaderName, NULL) END,
                CASE WHEN @CredentialFieldSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@CredentialFieldSchemaJSON, NULL) END,
                CASE WHEN @PaginationCursorParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationCursorParamName, NULL) END,
                CASE WHEN @PaginationCursorResponsePath_Clear = 1 THEN NULL ELSE ISNULL(@PaginationCursorResponsePath, NULL) END,
                CASE WHEN @PaginationLimitParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationLimitParamName, NULL) END,
                CASE WHEN @PaginationPageParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationPageParamName, NULL) END,
                CASE WHEN @PaginationOffsetParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationOffsetParamName, NULL) END,
                CASE WHEN @PaginationHasMoreResponsePath_Clear = 1 THEN NULL ELSE ISNULL(@PaginationHasMoreResponsePath, NULL) END,
                CASE WHEN @PaginationTotalCountResponsePath_Clear = 1 THEN NULL ELSE ISNULL(@PaginationTotalCountResponsePath, NULL) END,
                CASE WHEN @PaginationMaxPageSize_Clear = 1 THEN NULL ELSE ISNULL(@PaginationMaxPageSize, NULL) END,
                CASE WHEN @ErrorResponseShape_Clear = 1 THEN NULL ELSE ISNULL(@ErrorResponseShape, NULL) END,
                CASE WHEN @ErrorMessageFieldPath_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessageFieldPath, NULL) END,
                CASE WHEN @ErrorCodeFieldPath_Clear = 1 THEN NULL ELSE ISNULL(@ErrorCodeFieldPath, NULL) END,
                CASE WHEN @IncrementalSyncCapability_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalSyncCapability, NULL) END,
                CASE WHEN @IncrementalQueryParamName_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalQueryParamName, NULL) END,
                CASE WHEN @IncrementalQueryParamFormat_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalQueryParamFormat, NULL) END,
                ISNULL(@WebhooksAvailable, 0),
                CASE WHEN @WebhookSubscriptionAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@WebhookSubscriptionAPIPath, NULL) END,
                CASE WHEN @WebhookSignatureHeaderName_Clear = 1 THEN NULL ELSE ISNULL(@WebhookSignatureHeaderName, NULL) END,
                CASE WHEN @WebhookSignatureAlgorithm_Clear = 1 THEN NULL ELSE ISNULL(@WebhookSignatureAlgorithm, NULL) END,
                ISNULL(@BulkOperationsAvailable, 0),
                CASE WHEN @APIVersioningStrategy_Clear = 1 THEN NULL ELSE ISNULL(@APIVersioningStrategy, NULL) END,
                CASE WHEN @APIVersion_Clear = 1 THEN NULL ELSE ISNULL(@APIVersion, NULL) END,
                CASE WHEN @IdempotencyHeaderName_Clear = 1 THEN NULL ELSE ISNULL(@IdempotencyHeaderName, NULL) END,
                CASE WHEN @CustomObjectMarkerPattern_Clear = 1 THEN NULL ELSE ISNULL(@CustomObjectMarkerPattern, NULL) END,
                CASE WHEN @CustomFieldMarkerPattern_Clear = 1 THEN NULL ELSE ISNULL(@CustomFieldMarkerPattern, NULL) END,
                CASE WHEN @FKNamingConvention_Clear = 1 THEN NULL ELSE ISNULL(@FKNamingConvention, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegration] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegration] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spUpdateIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Integration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegration]
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @NavigationBaseURL_Clear bit = 0,
    @NavigationBaseURL nvarchar(500) = NULL,
    @ClassName_Clear bit = 0,
    @ClassName nvarchar(100) = NULL,
    @ImportPath_Clear bit = 0,
    @ImportPath nvarchar(100) = NULL,
    @BatchMaxRequestCount int = NULL,
    @BatchRequestWaitTime int = NULL,
    @ID uniqueidentifier,
    @CredentialTypeID_Clear bit = 0,
    @CredentialTypeID uniqueidentifier = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(MAX) = NULL,
    @ActionIconClass_Clear bit = 0,
    @ActionIconClass nvarchar(200) = NULL,
    @ActionCategoryName_Clear bit = 0,
    @ActionCategoryName nvarchar(255) = NULL,
    @ActionCategoryDescription_Clear bit = 0,
    @ActionCategoryDescription nvarchar(MAX) = NULL,
    @ActionParentCategoryName_Clear bit = 0,
    @ActionParentCategoryName nvarchar(255) = NULL,
    @IncludeSearchActions bit = NULL,
    @IncludeListActions bit = NULL,
    @CreateActionCategory bit = NULL,
    @PrimaryKeyFieldName_Clear bit = 0,
    @PrimaryKeyFieldName nvarchar(100) = NULL,
    @PrimaryKeyFieldConfidence_Clear bit = 0,
    @PrimaryKeyFieldConfidence nvarchar(20) = NULL,
    @APIBaseURL_Clear bit = 0,
    @APIBaseURL nvarchar(500) = NULL,
    @APIBaseURLMode_Clear bit = 0,
    @APIBaseURLMode nvarchar(50) = NULL,
    @DynamicAPIBaseURLSourceField_Clear bit = 0,
    @DynamicAPIBaseURLSourceField nvarchar(100) = NULL,
    @TokenRefreshStrategy_Clear bit = 0,
    @TokenRefreshStrategy nvarchar(50) = NULL,
    @TokenTTLSeconds_Clear bit = 0,
    @TokenTTLSeconds int = NULL,
    @AuthHeaderPattern_Clear bit = 0,
    @AuthHeaderPattern nvarchar(50) = NULL,
    @CustomAuthHeaderName_Clear bit = 0,
    @CustomAuthHeaderName nvarchar(100) = NULL,
    @CredentialFieldSchemaJSON_Clear bit = 0,
    @CredentialFieldSchemaJSON nvarchar(MAX) = NULL,
    @PaginationCursorParamName_Clear bit = 0,
    @PaginationCursorParamName nvarchar(100) = NULL,
    @PaginationCursorResponsePath_Clear bit = 0,
    @PaginationCursorResponsePath nvarchar(200) = NULL,
    @PaginationLimitParamName_Clear bit = 0,
    @PaginationLimitParamName nvarchar(100) = NULL,
    @PaginationPageParamName_Clear bit = 0,
    @PaginationPageParamName nvarchar(100) = NULL,
    @PaginationOffsetParamName_Clear bit = 0,
    @PaginationOffsetParamName nvarchar(100) = NULL,
    @PaginationHasMoreResponsePath_Clear bit = 0,
    @PaginationHasMoreResponsePath nvarchar(200) = NULL,
    @PaginationTotalCountResponsePath_Clear bit = 0,
    @PaginationTotalCountResponsePath nvarchar(200) = NULL,
    @PaginationMaxPageSize_Clear bit = 0,
    @PaginationMaxPageSize int = NULL,
    @ErrorResponseShape_Clear bit = 0,
    @ErrorResponseShape nvarchar(50) = NULL,
    @ErrorMessageFieldPath_Clear bit = 0,
    @ErrorMessageFieldPath nvarchar(200) = NULL,
    @ErrorCodeFieldPath_Clear bit = 0,
    @ErrorCodeFieldPath nvarchar(200) = NULL,
    @IncrementalSyncCapability_Clear bit = 0,
    @IncrementalSyncCapability nvarchar(50) = NULL,
    @IncrementalQueryParamName_Clear bit = 0,
    @IncrementalQueryParamName nvarchar(100) = NULL,
    @IncrementalQueryParamFormat_Clear bit = 0,
    @IncrementalQueryParamFormat nvarchar(50) = NULL,
    @WebhooksAvailable bit = NULL,
    @WebhookSubscriptionAPIPath_Clear bit = 0,
    @WebhookSubscriptionAPIPath nvarchar(500) = NULL,
    @WebhookSignatureHeaderName_Clear bit = 0,
    @WebhookSignatureHeaderName nvarchar(100) = NULL,
    @WebhookSignatureAlgorithm_Clear bit = 0,
    @WebhookSignatureAlgorithm nvarchar(50) = NULL,
    @BulkOperationsAvailable bit = NULL,
    @APIVersioningStrategy_Clear bit = 0,
    @APIVersioningStrategy nvarchar(50) = NULL,
    @APIVersion_Clear bit = 0,
    @APIVersion nvarchar(50) = NULL,
    @IdempotencyHeaderName_Clear bit = 0,
    @IdempotencyHeaderName nvarchar(100) = NULL,
    @CustomObjectMarkerPattern_Clear bit = 0,
    @CustomObjectMarkerPattern nvarchar(100) = NULL,
    @CustomFieldMarkerPattern_Clear bit = 0,
    @CustomFieldMarkerPattern nvarchar(100) = NULL,
    @FKNamingConvention_Clear bit = 0,
    @FKNamingConvention nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Integration]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [NavigationBaseURL] = CASE WHEN @NavigationBaseURL_Clear = 1 THEN NULL ELSE ISNULL(@NavigationBaseURL, [NavigationBaseURL]) END,
        [ClassName] = CASE WHEN @ClassName_Clear = 1 THEN NULL ELSE ISNULL(@ClassName, [ClassName]) END,
        [ImportPath] = CASE WHEN @ImportPath_Clear = 1 THEN NULL ELSE ISNULL(@ImportPath, [ImportPath]) END,
        [BatchMaxRequestCount] = ISNULL(@BatchMaxRequestCount, [BatchMaxRequestCount]),
        [BatchRequestWaitTime] = ISNULL(@BatchRequestWaitTime, [BatchRequestWaitTime]),
        [CredentialTypeID] = CASE WHEN @CredentialTypeID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialTypeID, [CredentialTypeID]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [ActionIconClass] = CASE WHEN @ActionIconClass_Clear = 1 THEN NULL ELSE ISNULL(@ActionIconClass, [ActionIconClass]) END,
        [ActionCategoryName] = CASE WHEN @ActionCategoryName_Clear = 1 THEN NULL ELSE ISNULL(@ActionCategoryName, [ActionCategoryName]) END,
        [ActionCategoryDescription] = CASE WHEN @ActionCategoryDescription_Clear = 1 THEN NULL ELSE ISNULL(@ActionCategoryDescription, [ActionCategoryDescription]) END,
        [ActionParentCategoryName] = CASE WHEN @ActionParentCategoryName_Clear = 1 THEN NULL ELSE ISNULL(@ActionParentCategoryName, [ActionParentCategoryName]) END,
        [IncludeSearchActions] = ISNULL(@IncludeSearchActions, [IncludeSearchActions]),
        [IncludeListActions] = ISNULL(@IncludeListActions, [IncludeListActions]),
        [CreateActionCategory] = ISNULL(@CreateActionCategory, [CreateActionCategory]),
        [PrimaryKeyFieldName] = CASE WHEN @PrimaryKeyFieldName_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryKeyFieldName, [PrimaryKeyFieldName]) END,
        [PrimaryKeyFieldConfidence] = CASE WHEN @PrimaryKeyFieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryKeyFieldConfidence, [PrimaryKeyFieldConfidence]) END,
        [APIBaseURL] = CASE WHEN @APIBaseURL_Clear = 1 THEN NULL ELSE ISNULL(@APIBaseURL, [APIBaseURL]) END,
        [APIBaseURLMode] = CASE WHEN @APIBaseURLMode_Clear = 1 THEN NULL ELSE ISNULL(@APIBaseURLMode, [APIBaseURLMode]) END,
        [DynamicAPIBaseURLSourceField] = CASE WHEN @DynamicAPIBaseURLSourceField_Clear = 1 THEN NULL ELSE ISNULL(@DynamicAPIBaseURLSourceField, [DynamicAPIBaseURLSourceField]) END,
        [TokenRefreshStrategy] = CASE WHEN @TokenRefreshStrategy_Clear = 1 THEN NULL ELSE ISNULL(@TokenRefreshStrategy, [TokenRefreshStrategy]) END,
        [TokenTTLSeconds] = CASE WHEN @TokenTTLSeconds_Clear = 1 THEN NULL ELSE ISNULL(@TokenTTLSeconds, [TokenTTLSeconds]) END,
        [AuthHeaderPattern] = CASE WHEN @AuthHeaderPattern_Clear = 1 THEN NULL ELSE ISNULL(@AuthHeaderPattern, [AuthHeaderPattern]) END,
        [CustomAuthHeaderName] = CASE WHEN @CustomAuthHeaderName_Clear = 1 THEN NULL ELSE ISNULL(@CustomAuthHeaderName, [CustomAuthHeaderName]) END,
        [CredentialFieldSchemaJSON] = CASE WHEN @CredentialFieldSchemaJSON_Clear = 1 THEN NULL ELSE ISNULL(@CredentialFieldSchemaJSON, [CredentialFieldSchemaJSON]) END,
        [PaginationCursorParamName] = CASE WHEN @PaginationCursorParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationCursorParamName, [PaginationCursorParamName]) END,
        [PaginationCursorResponsePath] = CASE WHEN @PaginationCursorResponsePath_Clear = 1 THEN NULL ELSE ISNULL(@PaginationCursorResponsePath, [PaginationCursorResponsePath]) END,
        [PaginationLimitParamName] = CASE WHEN @PaginationLimitParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationLimitParamName, [PaginationLimitParamName]) END,
        [PaginationPageParamName] = CASE WHEN @PaginationPageParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationPageParamName, [PaginationPageParamName]) END,
        [PaginationOffsetParamName] = CASE WHEN @PaginationOffsetParamName_Clear = 1 THEN NULL ELSE ISNULL(@PaginationOffsetParamName, [PaginationOffsetParamName]) END,
        [PaginationHasMoreResponsePath] = CASE WHEN @PaginationHasMoreResponsePath_Clear = 1 THEN NULL ELSE ISNULL(@PaginationHasMoreResponsePath, [PaginationHasMoreResponsePath]) END,
        [PaginationTotalCountResponsePath] = CASE WHEN @PaginationTotalCountResponsePath_Clear = 1 THEN NULL ELSE ISNULL(@PaginationTotalCountResponsePath, [PaginationTotalCountResponsePath]) END,
        [PaginationMaxPageSize] = CASE WHEN @PaginationMaxPageSize_Clear = 1 THEN NULL ELSE ISNULL(@PaginationMaxPageSize, [PaginationMaxPageSize]) END,
        [ErrorResponseShape] = CASE WHEN @ErrorResponseShape_Clear = 1 THEN NULL ELSE ISNULL(@ErrorResponseShape, [ErrorResponseShape]) END,
        [ErrorMessageFieldPath] = CASE WHEN @ErrorMessageFieldPath_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessageFieldPath, [ErrorMessageFieldPath]) END,
        [ErrorCodeFieldPath] = CASE WHEN @ErrorCodeFieldPath_Clear = 1 THEN NULL ELSE ISNULL(@ErrorCodeFieldPath, [ErrorCodeFieldPath]) END,
        [IncrementalSyncCapability] = CASE WHEN @IncrementalSyncCapability_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalSyncCapability, [IncrementalSyncCapability]) END,
        [IncrementalQueryParamName] = CASE WHEN @IncrementalQueryParamName_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalQueryParamName, [IncrementalQueryParamName]) END,
        [IncrementalQueryParamFormat] = CASE WHEN @IncrementalQueryParamFormat_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalQueryParamFormat, [IncrementalQueryParamFormat]) END,
        [WebhooksAvailable] = ISNULL(@WebhooksAvailable, [WebhooksAvailable]),
        [WebhookSubscriptionAPIPath] = CASE WHEN @WebhookSubscriptionAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@WebhookSubscriptionAPIPath, [WebhookSubscriptionAPIPath]) END,
        [WebhookSignatureHeaderName] = CASE WHEN @WebhookSignatureHeaderName_Clear = 1 THEN NULL ELSE ISNULL(@WebhookSignatureHeaderName, [WebhookSignatureHeaderName]) END,
        [WebhookSignatureAlgorithm] = CASE WHEN @WebhookSignatureAlgorithm_Clear = 1 THEN NULL ELSE ISNULL(@WebhookSignatureAlgorithm, [WebhookSignatureAlgorithm]) END,
        [BulkOperationsAvailable] = ISNULL(@BulkOperationsAvailable, [BulkOperationsAvailable]),
        [APIVersioningStrategy] = CASE WHEN @APIVersioningStrategy_Clear = 1 THEN NULL ELSE ISNULL(@APIVersioningStrategy, [APIVersioningStrategy]) END,
        [APIVersion] = CASE WHEN @APIVersion_Clear = 1 THEN NULL ELSE ISNULL(@APIVersion, [APIVersion]) END,
        [IdempotencyHeaderName] = CASE WHEN @IdempotencyHeaderName_Clear = 1 THEN NULL ELSE ISNULL(@IdempotencyHeaderName, [IdempotencyHeaderName]) END,
        [CustomObjectMarkerPattern] = CASE WHEN @CustomObjectMarkerPattern_Clear = 1 THEN NULL ELSE ISNULL(@CustomObjectMarkerPattern, [CustomObjectMarkerPattern]) END,
        [CustomFieldMarkerPattern] = CASE WHEN @CustomFieldMarkerPattern_Clear = 1 THEN NULL ELSE ISNULL(@CustomFieldMarkerPattern, [CustomFieldMarkerPattern]) END,
        [FKNamingConvention] = CASE WHEN @FKNamingConvention_Clear = 1 THEN NULL ELSE ISNULL(@FKNamingConvention, [FKNamingConvention]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Integration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegration
ON [${flyway:defaultSchema}].[Integration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Integration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Integration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegration] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spDeleteIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Integration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Integration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegration] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegration] TO [cdp_Developer], [cdp_Integration];

