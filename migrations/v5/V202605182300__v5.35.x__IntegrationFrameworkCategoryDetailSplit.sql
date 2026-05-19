/*
 * V202605182300 — Category-vs-Detail split + finalize CHECK-constraint universe.
 *
 * Gap 11 — surfaced 2026-05-18 during HubSpot Phase 2b clean-build re-run.
 *
 * MOTIVATION
 * ----------
 * Phase 2b agent emitted values that violated 7 CHECK constraints (e.g.,
 * AuthHeaderPattern='Bearer <token>' instead of 'authorization-bearer';
 * ErrorResponseShape={…full JSON shape…} instead of 'envelope-with-error-field').
 * The agent KNEW the vendor's actual mechanism specifically enough to describe
 * it. That's synthesis happening at the role-file-execution level — but the
 * framework had nowhere productive for synthesis to land except in a wrong-
 * format enum value.
 *
 * This is empirical evidence that implicit synthesis IS happening; synthesis
 * needs productive landing zones. The fix: for every KEPT enum field, provide
 * a companion Detail column (NVARCHAR(MAX)) where the agent emits the rich
 * specifics. The enum captures the CATEGORY (which kind of vendor pattern);
 * the Detail captures the actual shape (the literal JSON, the specific
 * suffix string, the exact algorithm encoding, etc.).
 *
 * Separately: a few CHECK constraints over-constrain vendor reality. The user-
 * audited decision per constraint follows. Settling the universe in one
 * migration to avoid revisiting the audit.
 *
 *
 * FULL CHECK-CONSTRAINT AUDIT (every constraint on Integration /
 * IntegrationObject / IntegrationObjectField introduced through V202605182100):
 *
 *   Integration:
 *     CK_Integration_APIBaseURLMode                  KEEP (3 modes — true categorical)
 *     CK_Integration_TokenRefreshStrategy            KEEP (4 strategies — true categorical)
 *     CK_Integration_AuthHeaderPattern               KEEP (4 patterns — true categorical; wire-form variants like 'Bearer <token>' go in AuthHeaderDetail)
 *     CK_Integration_ErrorResponseShape              KEEP (4 shapes — true categorical; actual JSON shape goes in ErrorResponseDetail)
 *     CK_Integration_IncrementalSyncCapability       KEEP (5 capabilities — true categorical; per-resource-vs-global distinction is the categorical signal)
 *     CK_Integration_IncrementalQueryParamFormat     DROP (vendor reality open-ended: ISO8601, epoch-seconds, epoch-milliseconds, RFC2822, opaque-cursor, vendor-custom, …)
 *     CK_Integration_WebhookSignatureAlgorithm       KEEP (limited algorithms — true categorical; encoding suffix like '-Base64' goes in WebhookSignatureDetail)
 *     CK_Integration_APIVersioningStrategy           KEEP (4 strategies — true categorical; APIVersion column already holds the version detail)
 *     CK_Integration_CustomObjectMarkerPattern       (already DROP'd in V202605182100 — vendor-scrub)
 *     CK_Integration_FKNamingConvention              DROP (vendor reality open-ended: snake-case-id-suffix, camelCase-Id-suffix, associations-api, graphql-edges, vendor-specific, …)
 *
 *   IntegrationObject:
 *     CK_IntegrationObject_IncrementalWatermarkType  KEEP (used by WatermarkService.ValidateWatermark switch — discriminator)
 *     CK_IntegrationObject_BulkAPIMethod             KEEP (HTTP verbs — universal categorical)
 *
 *   IntegrationObjectField:
 *     CK_IntegrationObjectField_FKDetectionMethod    DROP (extensible per the (extensible) slot in DF1-DF7 gate table; agents emit descriptive vendor-specific gate names when no DF gate matches)
 *
 * After this migration: 3 CHECKs dropped, 11 retained, 1 already-dropped, total 12 CHECKs active.
 *
 *
 * CATEGORY-vs-DETAIL COMPANION-COLUMN UNIVERSE:
 *
 *   Integration table — KEPT enum fields and their Detail companions:
 *     APIBaseURLMode             → DynamicAPIBaseURLSourceField (already exists since V202605181625)
 *     TokenRefreshStrategy       → TokenRefreshDetail (NEW — added by this migration)
 *     AuthHeaderPattern          → AuthHeaderDetail (NEW)
 *     ErrorResponseShape         → ErrorResponseDetail (NEW)
 *     IncrementalSyncCapability  → IncrementalSyncDetail (NEW)
 *     WebhookSignatureAlgorithm  → WebhookSignatureDetail (NEW)
 *     APIVersioningStrategy      → APIVersion (already exists since V202605181625)
 *     CustomObjectMarkerPattern  → CustomObjectMarkerDetail (NEW — agent was already emitting it as a JSON field-key without a column to land in)
 *     CustomFieldMarkerPattern   → CustomFieldMarkerDetail (NEW)
 *
 *   Integration table — DROP'd enum fields keep their Detail companions:
 *     FKNamingConvention         → FKNamingDetail (NEW)
 *
 *   IntegrationObject — KEPT enum field:
 *     IncrementalWatermarkType   → IncrementalWatermarkDetail (NEW)
 *
 *   IntegrationObjectField — DROP'd enum field:
 *     FKDetectionMethod          → FKDetectionDetail (NEW — for the "(extensible)" slot's descriptive gate-name explanations)
 *
 * Total new columns: 10 NVARCHAR(MAX) NULL columns across Integration / IntegrationObject / IntegrationObjectField.
 *
 *
 * ROLE-FILE CO-DELIVERABLE (committed separately in this batch):
 *
 *   .claude/agents/metadata-writer.md gains four new sections:
 *     1. CHECK-constraint enum vocabulary — per-field allowed-values listing
 *     2. Null-requires-provenance rule — every null MUST have an
 *        AbsenceOfEvidence PROVENANCE entry; no silent nulls
 *     3. Root-vs-per-IO scope — root values are vendor-wide invariants;
 *        per-IO variations emit null at root + go to Phase 2c
 *     4. Category-vs-Detail split — enum field gets the category;
 *        companion Detail field gets the rich specifics
 */

-- ─── STEP 1: Drop 3 CHECK constraints (vendor reality is open-ended) ──────────

ALTER TABLE ${flyway:defaultSchema}.Integration
    DROP CONSTRAINT CK_Integration_IncrementalQueryParamFormat;

ALTER TABLE ${flyway:defaultSchema}.Integration
    DROP CONSTRAINT CK_Integration_FKNamingConvention;

ALTER TABLE ${flyway:defaultSchema}.IntegrationObjectField
    DROP CONSTRAINT CK_IntegrationObjectField_FKDetectionMethod;

-- ─── STEP 2: Widen the now-uncheck'd columns to NVARCHAR(255) ────────────────

ALTER TABLE ${flyway:defaultSchema}.Integration
    ALTER COLUMN IncrementalQueryParamFormat NVARCHAR(255) NULL;

ALTER TABLE ${flyway:defaultSchema}.Integration
    ALTER COLUMN FKNamingConvention NVARCHAR(255) NULL;

ALTER TABLE ${flyway:defaultSchema}.IntegrationObjectField
    ALTER COLUMN FKDetectionMethod NVARCHAR(255) NULL;

-- ─── STEP 3: Add Detail companion columns on Integration ─────────────────────

ALTER TABLE ${flyway:defaultSchema}.Integration ADD
    TokenRefreshDetail        NVARCHAR(MAX)  NULL,
    AuthHeaderDetail          NVARCHAR(MAX)  NULL,
    ErrorResponseDetail       NVARCHAR(MAX)  NULL,
    IncrementalSyncDetail     NVARCHAR(MAX)  NULL,
    WebhookSignatureDetail    NVARCHAR(MAX)  NULL,
    CustomObjectMarkerDetail  NVARCHAR(MAX)  NULL,
    CustomFieldMarkerDetail   NVARCHAR(MAX)  NULL,
    FKNamingDetail            NVARCHAR(MAX)  NULL;

-- ─── STEP 4: Add Detail companion column on IntegrationObject ────────────────

ALTER TABLE ${flyway:defaultSchema}.IntegrationObject ADD
    IncrementalWatermarkDetail NVARCHAR(MAX) NULL;

-- ─── STEP 5: Add Detail companion column on IntegrationObjectField ───────────

ALTER TABLE ${flyway:defaultSchema}.IntegrationObjectField ADD
    FKDetectionDetail NVARCHAR(MAX) NULL;

-- ─── STEP 6: Extended-property descriptions ─────────────────────────────────

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for TokenRefreshStrategy. The strategy column holds the categorical kind (oauth2-refresh / jwt-resign-periodically / etc.); this column holds vendor-specific quirks (e.g., "JWT-bearer grant returns an instance_url in the auth response that must be preserved for subsequent requests"; "refresh_token rotation NOT performed by this vendor — preserve existing value when response omits it"). Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'TokenRefreshDetail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for AuthHeaderPattern. The pattern column holds the categorical shape (authorization-bearer / x-api-key / custom-header / none-uses-query); this column holds the exact wire format (e.g., literal "Bearer <token>" template, custom header name like "X-Acme-API-Key"). Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'AuthHeaderDetail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for ErrorResponseShape. The shape column holds the categorical kind (json-errors-array / envelope-with-error-field / http-status-only / custom); this column holds the actual JSON shape (e.g., {"status":"string","message":"string","errors":[...]}, where the connector reads ErrorMessageFieldPath and ErrorCodeFieldPath to extract details). Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'ErrorResponseDetail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for IncrementalSyncCapability. The capability column holds the categorical shape (global-query-param / per-resource-query-param / webhook-only / polling-only / none); this column holds the per-vendor specifics (e.g., "Search API filter dialect required; specific filter operators documented at URL"; "modifiedSince accepted on /v3 endpoints but NOT /v4 — see per-IO IncrementalQueryParamName overrides"). Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'IncrementalSyncDetail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for WebhookSignatureAlgorithm. The algorithm column holds the categorical primitive (hmac-sha256 / hmac-sha512 / rsa / none); this column holds the encoding + payload-structure detail (e.g., "HMAC-SHA256-Base64 over raw-body-bytes; client request method + URI prepended"). Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'WebhookSignatureDetail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for CustomObjectMarkerPattern. The pattern column holds the categorical shape (namespace-based / suffix-marker / flag-field / numeric-typeid-prefix / etc.); this column holds the actual marker (e.g., {"Marker":"objectTypeId","StandardPrefix":"0-","CustomPrefix":"2-","DiscoveryEndpoint":"/crm/v3/schemas"} for a numeric-typeid-prefix pattern). Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'CustomObjectMarkerDetail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for CustomFieldMarkerPattern. Same shape as CustomObjectMarkerDetail but applied at the IOF level. Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'CustomFieldMarkerDetail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for FKNamingConvention. The convention column holds the categorical shape; this column holds the actual mechanism (e.g., for "associations-api" convention: "FKs not embedded as fields on source objects; resolved via separate /associations API endpoint documented at URL"). Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'FKNamingDetail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for IncrementalWatermarkType (per-IO). The type column holds the categorical discriminator used by WatermarkService.ValidateWatermark (Timestamp / Version / Cursor / ChangeToken); this column holds per-IO specifics (e.g., "ISO-8601 with millisecond precision"; "epoch-seconds since vendor''s 1970-Jan-1 baseline"). Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'IncrementalWatermarkDetail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form rich detail for FKDetectionMethod (per-IOF). The method column holds the agent self-reported gate name; this column holds the structural signal that triggered it (e.g., for a vendor-specific gate not in DF1-DF7: "discovered via the vendor''s GraphQL relationship edge syntax — see URL"). Agent-emitted with PROVENANCE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'FKDetectionDetail';
