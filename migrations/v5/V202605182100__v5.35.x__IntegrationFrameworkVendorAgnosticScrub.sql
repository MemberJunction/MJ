/*
 * V202605182100 — Vendor-agnostic framework scrub.
 *
 * Drops CHECK constraints whose enum values contain vendor-specific names. Per
 * the framework principle "NO VENDOR-SPECIFIC KNOWLEDGE IN THE FRAMEWORK", the
 * database schema must work for a fictional vendor — it cannot enumerate the
 * actual vendors we expect to support. Per-vendor values come from agent
 * research output with provenance, not from a database CHECK constraint.
 *
 * Audit of CHECK constraints introduced by V202605181625 (IntegrationFrameworkExpansion):
 *
 *   CK_Integration_APIBaseURLMode                 — generic descriptors        ✅ KEEP
 *   CK_Integration_TokenRefreshStrategy           — generic mechanism names    ✅ KEEP
 *   CK_Integration_AuthHeaderPattern              — generic header shapes      ✅ KEEP
 *   CK_Integration_ErrorResponseShape             — generic response shapes    ✅ KEEP
 *   CK_Integration_IncrementalSyncCapability      — generic capability shapes  ✅ KEEP
 *   CK_Integration_IncrementalQueryParamFormat    — format descriptors         ✅ KEEP
 *   CK_Integration_WebhookSignatureAlgorithm      — crypto algorithm names     ✅ KEEP
 *   CK_Integration_APIVersioningStrategy          — generic versioning shapes  ✅ KEEP
 *   CK_Integration_CustomObjectMarkerPattern      — contains 'salesforce-...'
 *                                                   AND 'hubspot-...'          ❌ DROP — this migration
 *   CK_Integration_FKNamingConvention             — generic naming shapes      ✅ KEEP
 *   CK_IntegrationObject_IncrementalWatermarkType — type discriminators        ✅ KEEP
 *   CK_IntegrationObject_BulkAPIMethod            — HTTP verb names            ✅ KEEP
 *   CK_IntegrationObjectField_FKDetectionMethod   — generic detection-gate IDs ✅ KEEP
 *
 * Action: drop the one tainted constraint; widen the column to NVARCHAR(255)
 * for descriptive free-form values; update descriptions for both
 * CustomObjectMarkerPattern AND CustomFieldMarkerPattern to reflect free-form-
 * with-provenance semantics (CustomFieldMarkerPattern had no CHECK but its
 * description still pointed at the vendor-named enum vocabulary).
 *
 * After this migration: agents are free to emit values like 'namespace-based',
 * 'suffix-marker', 'flag-field', etc. with PROVENANCE describing the pattern.
 * If the per-vendor descriptive vocabulary needs to be machine-checkable
 * across vendors, that's a `.vendor-catalog.json` concern, NOT a CHECK
 * constraint.
 */

-- 1. Drop the vendor-tainted CHECK constraint.
ALTER TABLE ${flyway:defaultSchema}.Integration
    DROP CONSTRAINT CK_Integration_CustomObjectMarkerPattern;

-- 2. Widen both marker-pattern columns from NVARCHAR(100) to NVARCHAR(255) so
--    agents can emit descriptive free-form strings (e.g.
--    'namespace-with-customProperties-prefix-on-CRM-objects-via-Properties-API').
ALTER TABLE ${flyway:defaultSchema}.Integration
    ALTER COLUMN CustomObjectMarkerPattern NVARCHAR(255) NULL;

ALTER TABLE ${flyway:defaultSchema}.Integration
    ALTER COLUMN CustomFieldMarkerPattern NVARCHAR(255) NULL;

-- 3. Update column descriptions to reflect the free-form-with-provenance shape.

-- Drop old descriptions first (sp_updateextendedproperty fails if not present
-- with @level0type/level1type/level2type, so use the drop-then-add pattern).
IF EXISTS (
    SELECT 1
    FROM sys.extended_properties ep
    WHERE ep.class = 1
      AND ep.major_id = OBJECT_ID(N'${flyway:defaultSchema}.Integration')
      AND ep.minor_id = (
          SELECT column_id FROM sys.columns
          WHERE object_id = OBJECT_ID(N'${flyway:defaultSchema}.Integration')
            AND name = N'CustomObjectMarkerPattern'
      )
      AND ep.name = N'MS_Description'
)
EXEC sp_dropextendedproperty
    @name = N'MS_Description',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'CustomObjectMarkerPattern';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form descriptive string identifying how this vendor marks objects as custom vs standard. Values are agent-emitted with PROVENANCE citing the source doc. Use generic descriptors that would apply to any vendor exhibiting the same pattern (e.g., ''namespace-based'', ''suffix-marker'', ''flag-field'', ''numeric-typeid-prefix'') — avoid vendor names in the value. NULL when the vendor documents no custom-object mechanism.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'CustomObjectMarkerPattern';

IF EXISTS (
    SELECT 1
    FROM sys.extended_properties ep
    WHERE ep.class = 1
      AND ep.major_id = OBJECT_ID(N'${flyway:defaultSchema}.Integration')
      AND ep.minor_id = (
          SELECT column_id FROM sys.columns
          WHERE object_id = OBJECT_ID(N'${flyway:defaultSchema}.Integration')
            AND name = N'CustomFieldMarkerPattern'
      )
      AND ep.name = N'MS_Description'
)
EXEC sp_dropextendedproperty
    @name = N'MS_Description',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'CustomFieldMarkerPattern';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form descriptive string identifying how this vendor marks fields as custom vs standard (same vocabulary as CustomObjectMarkerPattern but applied at the IOF level). Agent-emitted with PROVENANCE. NULL when the vendor documents no custom-field mechanism.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Integration',
    @level2type = N'COLUMN', @level2name = N'CustomFieldMarkerPattern';
