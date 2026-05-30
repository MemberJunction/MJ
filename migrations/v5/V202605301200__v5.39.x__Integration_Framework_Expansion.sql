/* ============================================================================
   Integration Framework Expansion — Phase 0 / PR 1 Schema Changes
   v5.39.x

   This migration is the schema substrate for the integration framework redesign.
   Companion plan: /plans/integration-phase-0-pr1.md

   Adds (no destructive changes; existing data preserved):

   IntegrationObject:
     * Explicit per-operation write columns (replaces conflated Write* pair):
         - CreateAPIPath / CreateMethod / CreateBodyShape / CreateBodyKey / CreateIDLocation
         - UpdateAPIPath / UpdateMethod / UpdateBodyShape / UpdateBodyKey / UpdateIDLocation
         - DeleteAPIPath / DeleteIDLocation  (DeleteMethod already exists)
       BodyShape enum: { flat | wrapped | literal }
       IDLocation enum: { path | body | header | n/a }
     * IncrementalWatermarkField — vendor cursor/timestamp field name for incremental sync.
     * MetadataSource enum { Declared | Discovered | Custom } — provenance of each row.
                              (See companion plan §A.B2 for rollout strategy.)

   IntegrationObjectField:
     * MetadataSource enum { Declared | Discovered | Custom }.

   Existing columns retained:
     * WriteAPIPath / WriteMethod on IntegrationObject — DEPRECATED, kept one release as
       transient alias. Generic CRUD in BaseRESTIntegrationConnector reads only the new
       per-operation columns; the deprecated columns become dormant.
     * IsCustom on IntegrationObject and IntegrationObjectField — kept; populated from
       MetadataSource via engine logic in this release. Future migration retires it.

   No CodeGen-managed columns inserted manually (__mj_CreatedAt/__mj_UpdatedAt or
   FK indexes). Single ALTER TABLE per table with multiple ADD clauses per
   CLAUDE.md convention. sp_addextendedproperty for every new column so CodeGen
   surfaces descriptions on regen.

   ============================================================================ */


-- ============================================================================
-- IntegrationObject — new operation columns + MetadataSource + IncrementalWatermarkField
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.IntegrationObject ADD
    CreateAPIPath           NVARCHAR(MAX)   NULL,
    CreateMethod            NVARCHAR(20)    NULL,
    CreateBodyShape         NVARCHAR(50)    NULL,
    CreateBodyKey           NVARCHAR(100)   NULL,
    CreateIDLocation        NVARCHAR(20)    NULL,
    UpdateAPIPath           NVARCHAR(MAX)   NULL,
    UpdateMethod            NVARCHAR(20)    NULL,
    UpdateBodyShape         NVARCHAR(50)    NULL,
    UpdateBodyKey           NVARCHAR(100)   NULL,
    UpdateIDLocation        NVARCHAR(20)    NULL,
    DeleteAPIPath           NVARCHAR(MAX)   NULL,
    DeleteIDLocation        NVARCHAR(20)    NULL,
    IncrementalWatermarkField NVARCHAR(255) NULL,
    MetadataSource          NVARCHAR(20)    NOT NULL CONSTRAINT DF_IntegrationObject_MetadataSource DEFAULT ('Declared');
GO


-- CHECK constraints (separate ALTERs for constraint-add per SQL Server semantics)
ALTER TABLE ${flyway:defaultSchema}.IntegrationObject WITH NOCHECK ADD CONSTRAINT CK_IntegrationObject_CreateBodyShape
    CHECK (CreateBodyShape IS NULL OR CreateBodyShape IN ('flat', 'wrapped', 'literal'));

ALTER TABLE ${flyway:defaultSchema}.IntegrationObject WITH NOCHECK ADD CONSTRAINT CK_IntegrationObject_UpdateBodyShape
    CHECK (UpdateBodyShape IS NULL OR UpdateBodyShape IN ('flat', 'wrapped', 'literal'));

ALTER TABLE ${flyway:defaultSchema}.IntegrationObject WITH NOCHECK ADD CONSTRAINT CK_IntegrationObject_CreateIDLocation
    CHECK (CreateIDLocation IS NULL OR CreateIDLocation IN ('path', 'body', 'header', 'n/a'));

ALTER TABLE ${flyway:defaultSchema}.IntegrationObject WITH NOCHECK ADD CONSTRAINT CK_IntegrationObject_UpdateIDLocation
    CHECK (UpdateIDLocation IS NULL OR UpdateIDLocation IN ('path', 'body', 'header', 'n/a'));

ALTER TABLE ${flyway:defaultSchema}.IntegrationObject WITH NOCHECK ADD CONSTRAINT CK_IntegrationObject_DeleteIDLocation
    CHECK (DeleteIDLocation IS NULL OR DeleteIDLocation IN ('path', 'body', 'header', 'n/a'));

ALTER TABLE ${flyway:defaultSchema}.IntegrationObject WITH NOCHECK ADD CONSTRAINT CK_IntegrationObject_MetadataSource
    CHECK (MetadataSource IN ('Declared', 'Discovered', 'Custom'));


-- Extended properties (CodeGen surfaces these as field descriptions)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'HTTP path template for create operations. Generic CRUD in BaseRESTIntegrationConnector substitutes parent IDs into {var} placeholders. NULL means create not supported via metadata-driven path.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateAPIPath';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'HTTP method for create (typically POST). NULL means create not supported via metadata-driven path.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateMethod';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Request body shape for create: flat (top-level fields), wrapped (under CreateBodyKey), or literal (connector overrides CreateRecord and supplies own body).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateBodyShape';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Wrapper key for create body when CreateBodyShape=wrapped. Example: ''member'' for YourMembership which wraps body as {member:{...}}.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateBodyKey';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Where the created record ID is found in the create response: path (URL of returned Location header), body (parsed from JSON response), header (specific named header).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateIDLocation';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'HTTP path template for update operations. Typically contains {ID} placeholder substituted with the record ExternalID at runtime.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateAPIPath';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'HTTP method for update (typically PATCH or PUT).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateMethod';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Request body shape for update: flat | wrapped | literal. See CreateBodyShape.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateBodyShape';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Wrapper key for update body when UpdateBodyShape=wrapped.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateBodyKey';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For update: where the target record ID is located in the request — typically ''path'' (substituted into UpdateAPIPath URL template).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateIDLocation';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'HTTP path template for delete operations. Typically contains {ID} placeholder. NULL means delete not supported via metadata-driven path. (Existing DeleteMethod column carries the verb.)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'DeleteAPIPath';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For delete: where the target record ID is located — typically ''path''.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'DeleteIDLocation';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Vendor field name marking "last changed" — drives incremental sync filter when SupportsIncrementalSync=1. The exact filter syntax (e.g., $filter=Modified gt {value} or modified_since={value}) lives in Configuration.incrementalFilterFormat. Provable-only: leave NULL if docs do not name a watermark field.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'IncrementalWatermarkField';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provenance of this IntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'MetadataSource';


-- Mark existing Write* columns as deprecated (extended-property annotation; not destructive).
EXEC sp_addextendedproperty
    @name = N'MJ_Deprecation_Notice',
    @value = N'DEPRECATED v5.39.x — superseded by CreateAPIPath/UpdateAPIPath. Will be removed in a future release. Generic CRUD in BaseRESTIntegrationConnector reads only the per-operation columns.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'WriteAPIPath';

EXEC sp_addextendedproperty
    @name = N'MJ_Deprecation_Notice',
    @value = N'DEPRECATED v5.39.x — superseded by CreateMethod/UpdateMethod. Will be removed in a future release.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'WriteMethod';


-- ============================================================================
-- IntegrationObjectField — MetadataSource
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.IntegrationObjectField ADD
    MetadataSource          NVARCHAR(20)    NOT NULL CONSTRAINT DF_IntegrationObjectField_MetadataSource DEFAULT ('Declared');
GO

ALTER TABLE ${flyway:defaultSchema}.IntegrationObjectField WITH NOCHECK ADD CONSTRAINT CK_IntegrationObjectField_MetadataSource
    CHECK (MetadataSource IN ('Declared', 'Discovered', 'Custom'));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provenance of this IntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'MetadataSource';
