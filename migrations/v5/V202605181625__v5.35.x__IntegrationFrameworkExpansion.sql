-- ════════════════════════════════════════════════════════════════════════════
-- Integration framework expansion — hot-path metadata columns
--
-- Adds the per-vendor metadata columns the production-grade integration
-- framework needs to emit real bidirectional sync, incremental sync,
-- hierarchy-aware fetches, custom-object detection, and complete auth /
-- pagination / error-shape lifecycle handling. Cold-path metadata (validation
-- rules, hierarchy paths, webhook event types, rate-limit windows, bulk
-- async/status, soft-delete config) goes into existing Configuration JSON
-- columns rather than new schema columns.
--
-- See INTEGRATION-FRAMEWORK-REQUIREMENTS.md §3.3 (root scope), §4.1, §4.2, §4.3
-- and INTEGRATION-FRAMEWORK-DIRECTIVE.md §4.1.
-- ════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. MJ: Integrations (root) — auth lifecycle, pagination detail,
--    error shape, incremental capability, webhooks, bulk, API versioning,
--    custom-object/field markers, FK naming convention.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE ${flyway:defaultSchema}.Integration ADD
    APIBaseURL                       NVARCHAR(500)   NULL,
    APIBaseURLMode                   NVARCHAR(50)    NULL,
    DynamicAPIBaseURLSourceField     NVARCHAR(100)   NULL,
    TokenRefreshStrategy             NVARCHAR(50)    NULL,
    TokenTTLSeconds                  INT             NULL,
    AuthHeaderPattern                NVARCHAR(50)    NULL,
    CustomAuthHeaderName             NVARCHAR(100)   NULL,
    CredentialFieldSchemaJSON        NVARCHAR(MAX)   NULL,
    PaginationCursorParamName        NVARCHAR(100)   NULL,
    PaginationCursorResponsePath     NVARCHAR(200)   NULL,
    PaginationLimitParamName         NVARCHAR(100)   NULL,
    PaginationPageParamName          NVARCHAR(100)   NULL,
    PaginationOffsetParamName        NVARCHAR(100)   NULL,
    PaginationHasMoreResponsePath    NVARCHAR(200)   NULL,
    PaginationTotalCountResponsePath NVARCHAR(200)   NULL,
    PaginationMaxPageSize            INT             NULL,
    ErrorResponseShape               NVARCHAR(50)    NULL,
    ErrorMessageFieldPath            NVARCHAR(200)   NULL,
    ErrorCodeFieldPath               NVARCHAR(200)   NULL,
    IncrementalSyncCapability        NVARCHAR(50)    NULL,
    IncrementalQueryParamName        NVARCHAR(100)   NULL,
    IncrementalQueryParamFormat      NVARCHAR(50)    NULL,
    WebhooksAvailable                BIT             NOT NULL DEFAULT 0,
    WebhookSubscriptionAPIPath       NVARCHAR(500)   NULL,
    WebhookSignatureHeaderName       NVARCHAR(100)   NULL,
    WebhookSignatureAlgorithm        NVARCHAR(50)    NULL,
    BulkOperationsAvailable          BIT             NOT NULL DEFAULT 0,
    APIVersioningStrategy            NVARCHAR(50)    NULL,
    APIVersion                       NVARCHAR(50)    NULL,
    IdempotencyHeaderName            NVARCHAR(100)   NULL,
    CustomObjectMarkerPattern        NVARCHAR(100)   NULL,
    CustomFieldMarkerPattern         NVARCHAR(100)   NULL,
    FKNamingConvention               NVARCHAR(100)   NULL;
GO

-- CHECK constraints on enum fields
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_APIBaseURLMode
        CHECK (APIBaseURLMode IS NULL OR APIBaseURLMode IN ('static','dynamic-from-auth-response','dynamic-from-credential-field'));
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_TokenRefreshStrategy
        CHECK (TokenRefreshStrategy IS NULL OR TokenRefreshStrategy IN ('static-token','oauth2-refresh','jwt-resign-periodically','none'));
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_AuthHeaderPattern
        CHECK (AuthHeaderPattern IS NULL OR AuthHeaderPattern IN ('authorization-bearer','x-api-key','custom-header','none-uses-query'));
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_ErrorResponseShape
        CHECK (ErrorResponseShape IS NULL OR ErrorResponseShape IN ('json-errors-array','envelope-with-error-field','http-status-only','custom'));
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_IncrementalSyncCapability
        CHECK (IncrementalSyncCapability IS NULL OR IncrementalSyncCapability IN ('global-query-param','per-resource-query-param','webhook-only','polling-only','none'));
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_IncrementalQueryParamFormat
        CHECK (IncrementalQueryParamFormat IS NULL OR IncrementalQueryParamFormat IN ('ISO8601','epoch-seconds','opaque-cursor'));
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_WebhookSignatureAlgorithm
        CHECK (WebhookSignatureAlgorithm IS NULL OR WebhookSignatureAlgorithm IN ('hmac-sha256','hmac-sha512','rsa','none'));
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_APIVersioningStrategy
        CHECK (APIVersioningStrategy IS NULL OR APIVersioningStrategy IN ('path','header','query','none'));
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_CustomObjectMarkerPattern
        CHECK (CustomObjectMarkerPattern IS NULL OR CustomObjectMarkerPattern IN ('salesforce-double-underscore-c','hubspot-customProperties-namespace','prefix-based','attribute-flagged','none'));
ALTER TABLE ${flyway:defaultSchema}.Integration
    ADD CONSTRAINT CK_Integration_FKNamingConvention
        CHECK (FKNamingConvention IS NULL OR FKNamingConvention IN ('snake-case-id-suffix','camelCase-Id-suffix','object-named','vendor-specific','none'));
GO

-- Extended properties for every new Integration column
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Base URL the connector calls (e.g., https://api.hubapi.com). When APIBaseURLMode=dynamic-from-auth-response, this is the OAuth bootstrap host only; per-tenant URL comes from auth response.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'APIBaseURL';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'How the per-tenant API base URL is resolved. static = fixed; dynamic-from-auth-response = read from token response (e.g. Salesforce instance_url); dynamic-from-credential-field = read from CompanyIntegration.Configuration JSON.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'APIBaseURLMode';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'When APIBaseURLMode is dynamic, names the field in auth response or credential JSON that holds the resolved base URL (e.g., instance_url).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'DynamicAPIBaseURLSourceField';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Token lifecycle pattern. oauth2-refresh = standard OAuth2 refresh-token grant; jwt-resign-periodically = sign a fresh JWT each token TTL; static-token = long-lived API key; none = no token refresh path.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'TokenRefreshStrategy';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Access token time-to-live in seconds when documented by the vendor. Used by OAuth2TokenManager to schedule refresh before expiry.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'TokenTTLSeconds';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Wire-format auth header pattern. authorization-bearer = Authorization: Bearer <token>; x-api-key = X-API-Key: <token>; custom-header = vendor-specific (see CustomAuthHeaderName); none-uses-query = auth via query param, not header.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'AuthHeaderPattern';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'When AuthHeaderPattern=custom-header, the vendor-specific header name carrying the credential.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'CustomAuthHeaderName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'JSON describing which credential fields CompanyIntegration.Configuration must carry for this integration (field names, types, required flag, secret flag). Drives credential-input UI generation.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'CredentialFieldSchemaJSON';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Vendor parameter name carrying the pagination cursor (e.g., after for HubSpot, starting_after for Stripe). Null when PaginationType is not cursor-based.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'PaginationCursorParamName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Dotted path inside the response body where the next-page cursor appears (e.g., paging.next.after for HubSpot, next_page for Stripe).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'PaginationCursorResponsePath';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Vendor parameter name controlling page size (e.g., limit, per_page, page_size).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'PaginationLimitParamName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Vendor parameter name for page-number pagination (e.g., page). Null when not PageNumber pagination.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'PaginationPageParamName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Vendor parameter name for offset-based pagination (e.g., offset, skip). Null when not Offset pagination.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'PaginationOffsetParamName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Dotted response path holding the has-more boolean (e.g., has_more for Stripe, paging.next for HubSpot).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'PaginationHasMoreResponsePath';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Dotted response path holding the total-count integer (e.g., total, totalSize). Null when vendor does not return it.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'PaginationTotalCountResponsePath';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Maximum page size the vendor accepts (clamp for client-tunable pagination). Null when vendor enforces a fixed page size.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'PaginationMaxPageSize';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Shape of the vendor''s error response body. json-errors-array = {errors:[{...}]} (Salesforce); envelope-with-error-field = {error:{message,code}} (Stripe); http-status-only = no body; custom = vendor-specific (TransformError override required).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'ErrorResponseShape';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Dotted path inside the error body where the human-readable error message lives (e.g., error.message, errors[0].message).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'ErrorMessageFieldPath';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Dotted path inside the error body where the vendor-specific error code lives (e.g., error.code, errors[0].errorCode).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'ErrorCodeFieldPath';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'How the vendor exposes incremental sync. global-query-param = same param works on every endpoint; per-resource-query-param = different param per IO; webhook-only = events not pull; polling-only = client compares timestamps; none = full re-sync only.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'IncrementalSyncCapability';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'When IncrementalSyncCapability=global-query-param, the vendor parameter name (e.g., modifiedSince, updated[gte], since).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'IncrementalQueryParamName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Wire format for incremental watermark values. ISO8601 = 2026-01-01T00:00:00Z; epoch-seconds = unix integer; opaque-cursor = vendor-managed string.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'IncrementalQueryParamFormat';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether the vendor supports webhook subscriptions for real-time event delivery. When true, populate WebhookSubscriptionAPIPath + signature fields.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'WebhooksAvailable';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Vendor endpoint path for managing webhook subscriptions (create/delete/list). E.g., /webhooks for Stripe, /api/3/webhook/subscriptions for HubSpot.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'WebhookSubscriptionAPIPath';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'HTTP header name carrying the webhook signature for verification (e.g., Stripe-Signature, X-HubSpot-Signature-V3).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'WebhookSignatureHeaderName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Algorithm used to sign webhook payloads. hmac-sha256 (most common); hmac-sha512; rsa (for vendors using asymmetric signing); none (unsigned).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'WebhookSignatureAlgorithm';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether the vendor offers per-object bulk endpoints (batch create/update/delete or async bulk jobs). When true, per-IO BulkAPIPath populated where applicable.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'BulkOperationsAvailable';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'How the vendor identifies API version. path = /v1/ or /v2/ segment; header = Accept or X-API-Version; query = ?api-version=; none = unversioned.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'APIVersioningStrategy';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Currently targeted API version (e.g., v3, 2023-10-16, 60.0). Used by connector to construct paths when APIVersioningStrategy=path, headers when =header, query when =query.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'APIVersion';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'HTTP header name the vendor uses for idempotency keys (e.g., Idempotency-Key, Stripe-Idempotency-Key). Null when vendor does not support idempotency.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'IdempotencyHeaderName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Pattern the vendor uses to mark a sObject as custom vs standard. salesforce-double-underscore-c = Account__c; hubspot-customProperties-namespace = lives under customProperties; prefix-based = vendor prefix on the name; attribute-flagged = explicit isCustom in describe; none = no custom-object concept.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'CustomObjectMarkerPattern';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Pattern the vendor uses to mark a field as custom vs standard (same enum vocabulary as CustomObjectMarkerPattern but applied at the IOF level).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'CustomFieldMarkerPattern';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'How the vendor names foreign-key columns. snake-case-id-suffix = customer_id; camelCase-Id-suffix = customerId; object-named = customer (no suffix); vendor-specific = irregular pattern (requires per-vendor detection); none = no convention observed.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Integration',
    @level2type=N'COLUMN', @level2name=N'FKNamingConvention';
GO


-- ──────────────────────────────────────────────────────────────────────────
-- 2. MJ: Integration Objects (IO) — bidirectional flag, hierarchy fields,
--    incremental cursor metadata, standard/custom classification, bulk path.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE ${flyway:defaultSchema}.IntegrationObject ADD
    IsBidirectional               BIT             NOT NULL DEFAULT 0,
    ParentObjectName              NVARCHAR(255)   NULL,
    ParentObjectIDFieldName       NVARCHAR(255)   NULL,
    IncrementalCursorFieldName    NVARCHAR(255)   NULL,
    IncrementalWatermarkType      NVARCHAR(50)    NULL,
    IsStandardObject              BIT             NOT NULL DEFAULT 1,
    IsCustomObject                BIT             NOT NULL DEFAULT 0,
    BulkAPIPath                   NVARCHAR(500)   NULL,
    BulkAPIMethod                 NVARCHAR(10)    NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.IntegrationObject
    ADD CONSTRAINT CK_IntegrationObject_IncrementalWatermarkType
        CHECK (IncrementalWatermarkType IS NULL OR IncrementalWatermarkType IN ('Timestamp','Version','Cursor','ChangeToken'));
ALTER TABLE ${flyway:defaultSchema}.IntegrationObject
    ADD CONSTRAINT CK_IntegrationObject_BulkAPIMethod
        CHECK (BulkAPIMethod IS NULL OR BulkAPIMethod IN ('GET','POST','PUT','PATCH','DELETE'));
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether the vendor''s API supports write (Create/Update/Delete) for this object. Distinct from the Supports* verb flags — this is the higher-level "is the object writable at all" capability used to filter Action generation.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObject',
    @level2type=N'COLUMN', @level2name=N'IsBidirectional';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'When this IO''s API path is nested under another IO (e.g., /orgs/{OrgID}/users), the name of the parent IO. Null for root-level objects.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObject',
    @level2type=N'COLUMN', @level2name=N'ParentObjectName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Name of the IOF on this IO that holds the parent''s primary key value. Used to resolve path template variables when fetching nested resources.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObject',
    @level2type=N'COLUMN', @level2name=N'ParentObjectIDFieldName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Name of the IOF whose value is tracked as the incremental-sync watermark for this object. Must match WatermarkService.ValidateWatermark expectations for the chosen IncrementalWatermarkType.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObject',
    @level2type=N'COLUMN', @level2name=N'IncrementalCursorFieldName';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Semantic type of the watermark value. Timestamp = date/datetime (comparable); Version = monotonic integer/string; Cursor = opaque vendor cursor; ChangeToken = opaque vendor change marker.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObject',
    @level2type=N'COLUMN', @level2name=N'IncrementalWatermarkType';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether this object is part of the vendor''s standard catalog (true) vs a custom object defined per-tenant (false). Set by extraction from documented sources.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObject',
    @level2type=N'COLUMN', @level2name=N'IsStandardObject';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether this object matches the vendor''s custom-object marker pattern (e.g., __c suffix for Salesforce). Used to route Action generation + runtime handling for tenant-customized schema.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObject',
    @level2type=N'COLUMN', @level2name=N'IsCustomObject';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Vendor''s bulk-operation endpoint path for this object (when BulkOperationsAvailable=true at integration level). E.g., /services/data/v60.0/jobs/ingest for Salesforce Bulk API.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObject',
    @level2type=N'COLUMN', @level2name=N'BulkAPIPath';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'HTTP method used against BulkAPIPath. Typically POST for bulk-job creation; some vendors use PUT or PATCH.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObject',
    @level2type=N'COLUMN', @level2name=N'BulkAPIMethod';
GO


-- ──────────────────────────────────────────────────────────────────────────
-- 3. MJ: Integration Object Fields (IOF) — API writability, computed,
--    immutability, custom marker, incremental cursor candidacy, FK flag,
--    FK detection method, deprecation.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE ${flyway:defaultSchema}.IntegrationObjectField ADD
    IsAPIWritable                BIT             NOT NULL DEFAULT 0,
    IsComputed                   BIT             NOT NULL DEFAULT 0,
    IsImmutableAfterCreate       BIT             NOT NULL DEFAULT 0,
    IsCustomField                BIT             NOT NULL DEFAULT 0,
    IsIncrementalCursorCandidate BIT             NOT NULL DEFAULT 0,
    IsForeignKey                 BIT             NOT NULL DEFAULT 0,
    FKDetectionMethod            NVARCHAR(50)    NULL,
    IsDeprecated                 BIT             NOT NULL DEFAULT 0;
GO

ALTER TABLE ${flyway:defaultSchema}.IntegrationObjectField
    ADD CONSTRAINT CK_IntegrationObjectField_FKDetectionMethod
        CHECK (FKDetectionMethod IS NULL OR FKDetectionMethod IN ('openapi-ref','sdk-relationship-annotation','name-pattern-suffix','url-path-parent','vendor-specific','unknown'));
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether the vendor''s API accepts writes to this field. Distinct from IsReadOnly — IsReadOnly is a per-record runtime check, IsAPIWritable is the design-time API contract. A field can be IsReadOnly=false but IsAPIWritable=false (computed/write-only fields).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObjectField',
    @level2type=N'COLUMN', @level2name=N'IsAPIWritable';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether the vendor calculates this field (formula fields, derived values, aggregations). Computed fields are excluded from write bodies regardless of IsAPIWritable.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObjectField',
    @level2type=N'COLUMN', @level2name=N'IsComputed';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether this field is writable on Create but rejected on Update (e.g., legal-entity name, primary key alternative keys). CodeBuilder filters this out of Update bodies.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObjectField',
    @level2type=N'COLUMN', @level2name=N'IsImmutableAfterCreate';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether this field matches the vendor''s custom-field marker pattern (per CustomFieldMarkerPattern at the integration root). Tenant-specific custom fields surface here.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObjectField',
    @level2type=N'COLUMN', @level2name=N'IsCustomField';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether this field could serve as a watermark for incremental sync (timestamp/version/sequence type). The IO''s IncrementalCursorFieldName must reference an IOF where this flag is true.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObjectField',
    @level2type=N'COLUMN', @level2name=N'IsIncrementalCursorCandidate';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether this field is a foreign key (references another IO''s PK). Set by extractor''s universal FK gates (DF1-DF7); complements existing RelatedIntegrationObjectID which holds the target reference itself.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObjectField',
    @level2type=N'COLUMN', @level2name=N'IsForeignKey';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Self-reported gate that established the FK claim. openapi-ref = OpenAPI $ref to another schema; sdk-relationship-annotation = SDK type-level annotation; name-pattern-suffix = *Id naming match; url-path-parent = path templating implies parent; vendor-specific = vendor-managed; unknown = inferred but unverified.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObjectField',
    @level2type=N'COLUMN', @level2name=N'FKDetectionMethod';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Whether the vendor has marked this field as deprecated. Connector code may emit warnings on use; new metadata extractions should not consider this field for cursor/PK candidacy.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'IntegrationObjectField',
    @level2type=N'COLUMN', @level2name=N'IsDeprecated';
GO
