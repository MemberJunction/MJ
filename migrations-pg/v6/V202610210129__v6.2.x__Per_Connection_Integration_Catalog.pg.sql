-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610210129__v6.2.x__Per_Connection_Integration_Catalog.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================
   Per-connection integration catalog — CompanyIntegrationObject / CompanyIntegrationObjectField
   v6.2.x

   IntegrationObject and IntegrationObjectField are keyed by IntegrationID alone, so two
   connections (CompanyIntegrations) of the same connector share ONE set of object and field
   definitions: one tenant's discovery overwrites the other's sampled widths and custom columns,
   and one tenant's column-cap enforcement disables the object for everybody. These two tables
   give each connection its own catalog. Every declared column is carried verbatim so the engine
   can read either table through one projection; the additions are:

     * CompanyIntegrationID       — whose catalog this is
     * IntegrationObjectID / IntegrationObjectFieldID — which declared row it was rebased from
                                    (NULL when the object exists only for this connection)
     * Provenance / ProvenanceDetail — Declared | Endpoint | Sampled, and the per-attribute merge log
     * IsSelected / SelectedAt    — selection is an axis SEPARATE from Status, so a newly discovered
                                    object can arrive Active-but-unselected instead of Disabled
     * FirstSeenAt / LastSeenAt / LastSampledAt
     * ObservedMaxLength (fields) — the raw sampled width, kept apart from the padded Length

   Behaviour is flag-gated in the engine (CatalogSource Shared | PerConnection); with no rows here a
   connection reads the shared catalog exactly as before. No data is moved by this migration.

   Conventions (migrations/CLAUDE.md): DDL + sp_addextendedproperty only; entity metadata, views
   and CRUD procedures are CodeGen's; single-column FK indexes are CodeGen's; the PostgreSQL
   counterpart is build-engineer work at release time.
   ============================================================================ */
/* ============================================================================================== */
/* 1. Tables */
/* ============================================================================================== */
CREATE TABLE __mj."CompanyIntegrationObject" (
  "ID" UUID NOT NULL,
  "IntegrationID" UUID NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "DisplayName" VARCHAR(255) NULL,
  "Description" TEXT NULL,
  "Category" VARCHAR(100) NULL,
  "APIPath" VARCHAR(500) NOT NULL,
  "ResponseDataKey" VARCHAR(255) NULL,
  "DefaultPageSize" INT NOT NULL,
  "SupportsPagination" BOOLEAN NOT NULL,
  "PaginationType" VARCHAR(20) NOT NULL,
  "SupportsIncrementalSync" BOOLEAN NOT NULL,
  "SupportsWrite" BOOLEAN NOT NULL,
  "DefaultQueryParams" TEXT NULL,
  "Configuration" TEXT NULL,
  "Sequence" INT NOT NULL,
  "Status" VARCHAR(25) NOT NULL,
  "WriteAPIPath" VARCHAR(500) NULL,
  "WriteMethod" VARCHAR(10) NULL,
  "DeleteMethod" VARCHAR(10) NULL,
  "IsCustom" BOOLEAN NOT NULL,
  "CreateAPIPath" TEXT NULL,
  "CreateMethod" VARCHAR(20) NULL,
  "CreateBodyShape" VARCHAR(50) NULL,
  "CreateBodyKey" VARCHAR(100) NULL,
  "CreateIDLocation" VARCHAR(20) NULL,
  "UpdateAPIPath" TEXT NULL,
  "UpdateMethod" VARCHAR(20) NULL,
  "UpdateBodyShape" VARCHAR(50) NULL,
  "UpdateBodyKey" VARCHAR(100) NULL,
  "UpdateIDLocation" VARCHAR(20) NULL,
  "DeleteAPIPath" TEXT NULL,
  "DeleteIDLocation" VARCHAR(20) NULL,
  "IncrementalWatermarkField" VARCHAR(255) NULL,
  "MetadataSource" VARCHAR(20) NOT NULL,
  "SupportsCreate" BOOLEAN NOT NULL,
  "SupportsUpdate" BOOLEAN NOT NULL,
  "SupportsDelete" BOOLEAN NOT NULL,
  "SyncStrategy" VARCHAR(50) NULL,
  "ContentHashApplicable" BOOLEAN NOT NULL,
  "StableOrderingKey" VARCHAR(255) NULL,
  "CompanyIntegrationID" UUID NOT NULL,
  "IntegrationObjectID" UUID NULL,
  "Provenance" VARCHAR(20) NOT NULL,
  "ProvenanceDetail" TEXT NULL,
  "IsSelected" BOOLEAN NOT NULL,
  "SelectedAt" TIMESTAMPTZ(7) NULL,
  "FirstSeenAt" TIMESTAMPTZ(7) NULL,
  "LastSeenAt" TIMESTAMPTZ(7) NULL,
  "LastSampledAt" TIMESTAMPTZ(7) NULL
);

CREATE TABLE __mj."CompanyIntegrationObjectField" (
  "ID" UUID NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "DisplayName" VARCHAR(255) NULL,
  "Description" TEXT NULL,
  "Category" VARCHAR(100) NULL,
  "Type" VARCHAR(100) NOT NULL,
  "Length" INT NULL,
  "Precision" INT NULL,
  "Scale" INT NULL,
  "AllowsNull" BOOLEAN NOT NULL,
  "DefaultValue" VARCHAR(255) NULL,
  "IsPrimaryKey" BOOLEAN NOT NULL,
  "IsUniqueKey" BOOLEAN NOT NULL,
  "IsReadOnly" BOOLEAN NOT NULL,
  "IsRequired" BOOLEAN NOT NULL,
  "RelatedIntegrationObjectFieldName" VARCHAR(255) NULL,
  "Sequence" INT NOT NULL,
  "Configuration" TEXT NULL,
  "Status" VARCHAR(25) NOT NULL,
  "IsCustom" BOOLEAN NOT NULL,
  "MetadataSource" VARCHAR(20) NOT NULL,
  "CompanyIntegrationObjectID" UUID NOT NULL,
  "RelatedCompanyIntegrationObjectID" UUID NULL,
  "IntegrationObjectFieldID" UUID NULL,
  "ObservedMaxLength" INT NULL,
  "Provenance" VARCHAR(20) NOT NULL,
  "ProvenanceDetail" TEXT NULL,
  "IsSelected" BOOLEAN NOT NULL,
  "SelectedAt" TIMESTAMPTZ(7) NULL,
  "FirstSeenAt" TIMESTAMPTZ(7) NULL,
  "LastSeenAt" TIMESTAMPTZ(7) NULL,
  "LastSampledAt" TIMESTAMPTZ(7) NULL
);

ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "ID" SET DEFAULT GEN_RANDOM_UUID();
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "DefaultPageSize" SET DEFAULT 100;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "SupportsPagination" SET DEFAULT TRUE;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "PaginationType" SET DEFAULT 'PageNumber';
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "SupportsIncrementalSync" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "SupportsWrite" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "Sequence" SET DEFAULT 0;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "Status" SET DEFAULT 'Active';
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "WriteMethod" SET DEFAULT 'POST';
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "DeleteMethod" SET DEFAULT 'DELETE';
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "IsCustom" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "MetadataSource" SET DEFAULT 'Declared';
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "SupportsCreate" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "SupportsUpdate" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "SupportsDelete" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "ContentHashApplicable" SET DEFAULT TRUE;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "Provenance" SET DEFAULT 'Declared';
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "IsSelected" SET DEFAULT FALSE;

ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "ID" SET DEFAULT GEN_RANDOM_UUID();
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "AllowsNull" SET DEFAULT TRUE;
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "IsPrimaryKey" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "IsUniqueKey" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "IsReadOnly" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "IsRequired" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "Sequence" SET DEFAULT 0;
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "Status" SET DEFAULT 'Active';
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "IsCustom" SET DEFAULT FALSE;
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "MetadataSource" SET DEFAULT 'Declared';
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "Provenance" SET DEFAULT 'Declared';
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "IsSelected" SET DEFAULT FALSE;

ALTER TABLE __mj."CompanyIntegrationObject"
ADD CONSTRAINT "PK_CompanyIntegrationObject" PRIMARY KEY ("ID") /* ============================================================================================== */ /* 3. Keys, foreign keys and checks */ /* ============================================================================================== */;
ALTER TABLE __mj."CompanyIntegrationObject"
  ADD CONSTRAINT "UQ_CompanyIntegrationObject_Name" UNIQUE (
    "CompanyIntegrationID",
    "Name"
  );
ALTER TABLE __mj."CompanyIntegrationObject"
  ADD CONSTRAINT "FK_CompanyIntegrationObject_CompanyIntegrationID" FOREIGN KEY ("CompanyIntegrationID") REFERENCES __mj."CompanyIntegration" (
    "ID"
  );
ALTER TABLE __mj."CompanyIntegrationObject"
  ADD CONSTRAINT "FK_CompanyIntegrationObject_IntegrationObjectID" FOREIGN KEY ("IntegrationObjectID") REFERENCES __mj."IntegrationObject" (
    "ID"
  );
ALTER TABLE __mj."CompanyIntegrationObject"
  ADD CONSTRAINT "CK_CompanyIntegrationObject_Provenance" CHECK ("Provenance" IN ('Declared', 'Endpoint', 'Sampled'));
ALTER TABLE __mj."CompanyIntegrationObject"
  ADD CONSTRAINT "CK_CompanyIntegrationObject_Status" CHECK ("Status" IN ('Active', 'Deprecated', 'Disabled'));
ALTER TABLE __mj."CompanyIntegrationObject"
  ADD CONSTRAINT "CK_CompanyIntegrationObject_MetadataSource" CHECK ("MetadataSource" IN ('Declared', 'Discovered', 'Custom'));
ALTER TABLE __mj."CompanyIntegrationObject"
  ADD CONSTRAINT "FK_CompanyIntegrationObject_IntegrationID" FOREIGN KEY ("IntegrationID") REFERENCES __mj."Integration" (
    "ID"
  );

ALTER TABLE __mj."CompanyIntegrationObjectField"
ADD CONSTRAINT "PK_CompanyIntegrationObjectField" PRIMARY KEY ("ID");
ALTER TABLE __mj."CompanyIntegrationObjectField"
  ADD CONSTRAINT "UQ_CompanyIntegrationObjectField_Name" UNIQUE (
    "CompanyIntegrationObjectID",
    "Name"
  );
ALTER TABLE __mj."CompanyIntegrationObjectField"
  ADD CONSTRAINT "FK_CompanyIntegrationObjectField_CompanyIntegrationObjectID" FOREIGN KEY ("CompanyIntegrationObjectID") REFERENCES __mj."CompanyIntegrationObject" (
    "ID"
  );
ALTER TABLE __mj."CompanyIntegrationObjectField"
  ADD CONSTRAINT "FK_CompanyIntegrationObjectField_RelatedCompanyIntegrationObjectID" FOREIGN KEY ("RelatedCompanyIntegrationObjectID") REFERENCES __mj."CompanyIntegrationObject" (
    "ID"
  );
ALTER TABLE __mj."CompanyIntegrationObjectField"
  ADD CONSTRAINT "FK_CompanyIntegrationObjectField_IntegrationObjectFieldID" FOREIGN KEY ("IntegrationObjectFieldID") REFERENCES __mj."IntegrationObjectField" (
    "ID"
  );
ALTER TABLE __mj."CompanyIntegrationObjectField"
  ADD CONSTRAINT "CK_CompanyIntegrationObjectField_Provenance" CHECK ("Provenance" IN ('Declared', 'Endpoint', 'Sampled'));
ALTER TABLE __mj."CompanyIntegrationObjectField"
  ADD CONSTRAINT "CK_CompanyIntegrationObjectField_Status" CHECK ("Status" IN ('Active', 'Deprecated', 'Disabled'));
ALTER TABLE __mj."CompanyIntegrationObjectField"
  ADD CONSTRAINT "CK_CompanyIntegrationObjectField_MetadataSource" CHECK ("MetadataSource" IN ('Declared', 'Discovered', 'Custom'));

/* ============================================================================================== */
/* 4. Indexes (composite only — CodeGen creates the single-column foreign-key indexes) */
/* ============================================================================================== */
CREATE INDEX "IX_CompanyIntegrationObject_Connection_Status_Sequence" ON __mj."CompanyIntegrationObject"("CompanyIntegrationID", "Status", "Sequence");

CREATE INDEX "IX_CompanyIntegrationObjectField_Object_Status" ON __mj."CompanyIntegrationObjectField"("CompanyIntegrationObjectID", "Status");

COMMENT ON TABLE __mj."CompanyIntegrationObject" IS 'One connection''s (CompanyIntegration''s) own copy of an integration object: the vendor''s declared definition rebased with what THIS connection discovered and sampled, with provenance, and with selection (IsSelected) as an axis separate from Status. Replaces reading IntegrationObject directly so two connections of one connector no longer overwrite each other.';

COMMENT ON TABLE __mj."CompanyIntegrationObjectField" IS 'A field of a CompanyIntegrationObject: the declared field definition rebased with this connection''s own discovery and sampling (observed width, provenance), with selection separate from Status.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."Name" IS 'Internal/programmatic name of the external object (e.g., Members, Events)';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."IntegrationID" IS 'The integration (connector) this object belongs to. Always the IntegrationID of the owning CompanyIntegration, copied onto the row by the catalog writer so the per-connection catalog can be read through the same projection as the shared IntegrationObject catalog.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."DisplayName" IS 'Human-friendly display label';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."Description" IS 'Description of what this external object represents';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."Category" IS 'UI grouping category (e.g., Membership, Events, Finance)';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."APIPath" IS 'API endpoint path, may include template variables like {ProfileID} that are resolved at runtime from parent object records';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."ResponseDataKey" IS 'JSON key used to extract the data array from the API response envelope. NULL means the response is a root-level array.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."DefaultPageSize" IS 'Number of records to request per page from the API';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."SupportsPagination" IS 'Whether this endpoint supports paginated fetching';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."PaginationType" IS 'Pagination strategy: PageNumber (page index), Offset (record offset), Cursor (opaque token), or None';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."SupportsIncrementalSync" IS 'Whether this object supports watermark-based incremental sync';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."SupportsWrite" IS 'Whether data can be pushed back to this object via the API';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."DefaultQueryParams" IS 'JSON object of default query parameters to include with every API request for this object';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."Configuration" IS 'Freeform JSON for connector-specific configuration not covered by standard columns';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."Sequence" IS 'Processing and display order. Lower numbers are processed first.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."Status" IS 'Active, Deprecated, or Disabled. Mirrors EntityField status values.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."WriteAPIPath" IS 'API path for create/update operations when different from the read APIPath. If NULL, the read APIPath is used for writes as well.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."WriteMethod" IS 'HTTP method for create operations. Defaults to POST.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."DeleteMethod" IS 'HTTP method for delete operations. Defaults to DELETE.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."IsCustom" IS 'When true, this object was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."CreateAPIPath" IS 'HTTP path template for create operations. Generic CRUD in BaseRESTIntegrationConnector substitutes parent IDs into {var} placeholders. NULL means create not supported via metadata-driven path.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."CreateMethod" IS 'HTTP method for create (typically POST). NULL means create not supported via metadata-driven path.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."CreateBodyShape" IS 'Request body shape for create: flat (top-level fields), wrapped (under CreateBodyKey), or literal (connector overrides CreateRecord and supplies own body).';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."CreateBodyKey" IS 'Wrapper key for create body when CreateBodyShape=wrapped. Example: ''member'' for YourMembership which wraps body as {member:{...}}.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."CreateIDLocation" IS 'Where the created record ID is found in the create response: path (URL of returned Location header), body (parsed from JSON response), header (specific named header).';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."UpdateAPIPath" IS 'HTTP path template for update operations. Typically contains {ID} placeholder substituted with the record ExternalID at runtime.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."UpdateMethod" IS 'HTTP method for update (typically PATCH or PUT).';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."UpdateBodyShape" IS 'Request body shape for update: flat | wrapped | literal. See CreateBodyShape.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."UpdateBodyKey" IS 'Wrapper key for update body when UpdateBodyShape=wrapped.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."UpdateIDLocation" IS 'For update: where the target record ID is located in the request — typically ''path'' (substituted into UpdateAPIPath URL template).';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."DeleteAPIPath" IS 'HTTP path template for delete operations. Typically contains {ID} placeholder. NULL means delete not supported via metadata-driven path. (Existing DeleteMethod column carries the verb.)';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."DeleteIDLocation" IS 'For delete: where the target record ID is located — typically ''path''.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."IncrementalWatermarkField" IS 'Vendor field name marking "last changed" — drives incremental sync filter when SupportsIncrementalSync=1. The exact filter syntax (e.g., $filter=Modified gt {value} or modified_since={value}) lives in Configuration.incrementalFilterFormat. Provable-only: leave NULL if docs do not name a watermark field.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."MetadataSource" IS 'Provenance of this CompanyIntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."SupportsCreate" IS 'Whether this object supports record creation in the external system (per-operation granularity beyond SupportsWrite). Drives whether the generic CreateRecord path is wired and whether the object is offered for write-back create.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."SupportsUpdate" IS 'Whether this object supports record updates in the external system (per-operation granularity beyond SupportsWrite).';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."SupportsDelete" IS 'Whether this object supports record deletion/tombstoning in the external system (per-operation granularity beyond SupportsWrite).';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."SyncStrategy" IS 'Declared incremental sync strategy for this object (e.g. WatermarkIncremental, ContentHash, FullSnapshot). Informs how the engine narrows subsequent syncs.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."ContentHashApplicable" IS 'Whether per-record content hashing is meaningful for this object (false for append-only/event streams where every row is new). Controls whether the engine uses content-hash to skip unchanged-row writes.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."StableOrderingKey" IS 'Stable, monotonic ordering column (usually the PK) used for keyset/no-watermark resume of a scan. Null when the object has no stable key.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."Provenance" IS 'Where this row came from: Declared (the connector shipped catalog), Endpoint (the source listed it) or Sampled (only streaming records revealed it). Answers "whose is this" for a connection whose catalog no longer matches the connector default.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."ProvenanceDetail" IS 'The per-attribute merge log for this row: which side won each overlay decision and why. The persist already computes this and throws it away, so the operator has never been able to see why a width or a key looks the way it does.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."IsSelected" IS 'Whether this connection syncs this item. THE AXIS THAT MAKES THE CONTRACT SATISFIABLE: Status says whether the item is in the catalog at all, IsSelected says whether the customer chose it. Conflating the two is why a newly discovered object had to arrive ENABLED — a disabled object was excluded from schema introspection, so it never reached key inference and never reached a migration.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."SelectedAt" IS 'When the selection last changed. Lets the UI distinguish "never chosen" from "deliberately deselected".';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."FirstSeenAt" IS 'When this connection first observed this item. Set once and never updated, so a catalog can be read as a history of what the source exposed and when.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."LastSeenAt" IS 'When this connection most recently observed this item. A row whose LastSeenAt is older than the connection last discovery is what "absent from the source" means.';

COMMENT ON COLUMN __mj."CompanyIntegrationObject"."LastSampledAt" IS 'When sampling last streamed records for this item. Distinct from LastSeenAt: an item can be listed by an endpoint without ever being sampled, and unsampled items are exactly the ones whose widths and keys came from the declared catalog rather than from data.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Name" IS 'Field name as returned by the external API';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."DisplayName" IS 'Human-friendly display label for the field';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Description" IS 'Description of what this field represents';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Category" IS 'UI grouping category within the object';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Type" IS 'Data type of the field (e.g., nvarchar, int, datetime, decimal, bit). Uses same type vocabulary as EntityField.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Length" IS 'Maximum length for string types';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Precision" IS 'Numeric precision';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Scale" IS 'Numeric scale';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."AllowsNull" IS 'Whether the field can contain NULL values';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."DefaultValue" IS 'Default value from the source system';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."IsPrimaryKey" IS 'Whether this field is part of the object primary key';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."IsUniqueKey" IS 'Whether values must be unique across all records';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."IsReadOnly" IS 'Whether this field cannot be written back to the source system';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."IsRequired" IS 'Whether this field is required for create/update operations';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."RelatedIntegrationObjectFieldName" IS 'The field name on the related IntegrationObject that this FK points to (typically the PK field)';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Sequence" IS 'Display and processing order within the object. Lower numbers appear first.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Configuration" IS 'Freeform JSON for connector-specific field configuration';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Status" IS 'Active, Deprecated, or Disabled. Mirrors EntityField status values.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."IsCustom" IS 'When true, this field was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."MetadataSource" IS 'Provenance of this CompanyIntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."ObservedMaxLength" IS 'The longest value sampling actually saw, kept SEPARATE from Length. Length carries the padded width the schema builder will use; this carries the evidence. Without both, a width cannot be audited and a truncation cannot be distinguished from a bad guess.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."Provenance" IS 'Where this row came from: Declared (the connector shipped catalog), Endpoint (the source listed it) or Sampled (only streaming records revealed it). Answers "whose is this" for a connection whose catalog no longer matches the connector default.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."ProvenanceDetail" IS 'The per-attribute merge log for this row: which side won each overlay decision and why. The persist already computes this and throws it away, so the operator has never been able to see why a width or a key looks the way it does.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."IsSelected" IS 'Whether this connection syncs this item. THE AXIS THAT MAKES THE CONTRACT SATISFIABLE: Status says whether the item is in the catalog at all, IsSelected says whether the customer chose it. Conflating the two is why a newly discovered object had to arrive ENABLED — a disabled object was excluded from schema introspection, so it never reached key inference and never reached a migration.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."SelectedAt" IS 'When the selection last changed. Lets the UI distinguish "never chosen" from "deliberately deselected".';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."FirstSeenAt" IS 'When this connection first observed this item. Set once and never updated, so a catalog can be read as a history of what the source exposed and when.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."LastSeenAt" IS 'When this connection most recently observed this item. A row whose LastSeenAt is older than the connection last discovery is what "absent from the source" means.';

COMMENT ON COLUMN __mj."CompanyIntegrationObjectField"."LastSampledAt" IS 'When sampling last streamed records for this item. Distinct from LastSeenAt: an item can be listed by an endpoint without ever being sampled, and unsampled items are exactly the ones whose widths and keys came from the declared catalog rather than from data.';

/* *************************************************************************************************
 **************************************************************************************************
 **                                                                                              **
 **                    GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND                 **
 **                                                                                              **
 **  Everything below this block was produced by `mj codegen` against the schema above. It      **
 **  contains, for MJ: Company Integration Objects and MJ: Company Integration Object Fields:     **
 **    • the __mj_CreatedAt / __mj_UpdatedAt columns CodeGen owns, with their defaults            **
 **    • the Entity rows, application membership and role permissions                            **
 **    • the EntityField rows (apply-time Sequence), value lists and EntityRelationship rows      **
 **    • foreign-key indexes, base views and their permissions                                    **
 **    • CRUD stored procedures (spCreate / spUpdate / spDelete for both entities)                **
 **                                                                                              **
 **  It is appended here — rather than left as a standalone CodeGen_Run_*.sql file — so the       **
 **  tables and their generated objects apply as ONE migration, per MJ convention. DO NOT         **
 **  hand-edit below this line; if the DDL above changes, re-run CodeGen and replace this section.**
 **                                                                                              **
 **************************************************************************************************
 ************************************************************************************************* */
/* SQL generated to create new entity MJ: Company Integration Objects */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '3c30fa05-9490-49f0-8943-6052573c66b2',
    'MJ: Company Integration Objects',
    'Company Integration Objects',
    'One connection''s (CompanyIntegration''s) own copy of an integration object: the vendor''s declared definition rebased with what THIS connection discovered and sampled, with provenance, and with selection (IsSelected) as an axis separate from Status. Replaces reading IntegrationObject directly so two connections of one connector no longer overwrite each other.',
    NULL,
    'CompanyIntegrationObject',
    'vwCompanyIntegrationObjects',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Company Integration Objects to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '3c30fa05-9490-49f0-8943-6052573c66b2',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Company Integration Objects for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Company Integration Objects for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Company Integration Objects for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Company Integration Object Fields */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '2d4f0c97-b8f8-46be-b75a-bfa90f93d368',
    'MJ: Company Integration Object Fields',
    'Company Integration Object Fields',
    'A field of a CompanyIntegrationObject: the declared field definition rebased with this connection''s own discovery and sampling (observed width, provenance), with selection separate from Status.',
    NULL,
    'CompanyIntegrationObjectField',
    'vwCompanyIntegrationObjectFields',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Company Integration Object Fields to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '2d4f0c97-b8f8-46be-b75a-bfa90f93d368',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Company Integration Object Fields for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Company Integration Object Fields for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Company Integration Object Fields for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."CompanyIntegrationObject"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.CompanyIntegrationObject */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.CompanyIntegrationObject */
UPDATE __mj."CompanyIntegrationObject" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'CompanyIntegrationObject' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."CompanyIntegrationObject"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.CompanyIntegrationObject */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.CompanyIntegrationObject */
UPDATE __mj."CompanyIntegrationObject" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'CompanyIntegrationObject' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."CompanyIntegrationObject" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."CompanyIntegrationObjectField"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.CompanyIntegrationObjectField */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.CompanyIntegrationObjectField */
UPDATE __mj."CompanyIntegrationObjectField" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'CompanyIntegrationObjectField' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."CompanyIntegrationObjectField"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.CompanyIntegrationObjectField */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.CompanyIntegrationObjectField */
UPDATE __mj."CompanyIntegrationObjectField" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'CompanyIntegrationObjectField' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."CompanyIntegrationObjectField" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '05be7057-744d-4633-b84d-0903cd97ea2c' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('05be7057-744d-4633-b84d-0903cd97ea2c', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '507eba52-4eed-4a99-bf38-8057856ea2dd' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'IntegrationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('507eba52-4eed-4a99-bf38-8057856ea2dd', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'IntegrationID', 'Integration ID', 'The integration (connector) this object belongs to. Always the IntegrationID of the owning CompanyIntegration, copied onto the row by the catalog writer so the per-connection catalog can be read through the same projection as the shared IntegrationObject catalog.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'DD238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3016c7c1-9590-458d-bee2-63e243bd1563' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3016c7c1-9590-458d-bee2-63e243bd1563', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'Name', 'Name', 'Internal/programmatic name of the external object (e.g., Members, Events)', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15ba5f59-d1c7-4c0b-afe7-4180206fd238' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'DisplayName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('15ba5f59-d1c7-4c0b-afe7-4180206fd238', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'DisplayName', 'Display Name', 'Human-friendly display label', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '906841c6-b61b-48da-ad0e-3e4f2548f8a5' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('906841c6-b61b-48da-ad0e-3e4f2548f8a5', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'Description', 'Description', 'Description of what this external object represents', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd803190-da6e-4672-9068-d16facb5c38b' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'Category')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cd803190-da6e-4672-9068-d16facb5c38b', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'Category', 'Category', 'UI grouping category (e.g., Membership, Events, Finance)', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'faa619bc-1892-4592-8161-d87271ee248e' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'APIPath')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('faa619bc-1892-4592-8161-d87271ee248e', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'APIPath', 'API Path', 'API endpoint path, may include template variables like {ProfileID} that are resolved at runtime from parent object records', 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '088667b9-6ff6-45c7-b537-1e84f5da2bf6' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'ResponseDataKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('088667b9-6ff6-45c7-b537-1e84f5da2bf6', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'ResponseDataKey', 'Response Data Key', 'JSON key used to extract the data array from the API response envelope. NULL means the response is a root-level array.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4b7f90d2-84e4-4a50-9e39-1f6aa7ae41d0' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'DefaultPageSize')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b7f90d2-84e4-4a50-9e39-1f6aa7ae41d0', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'DefaultPageSize', 'Default Page Size', 'Number of records to request per page from the API', 'int', 4, 10, 0, FALSE, '(100)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c10df761-0fb3-4892-9b6d-8803df35919b' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'SupportsPagination')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c10df761-0fb3-4892-9b6d-8803df35919b', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'SupportsPagination', 'Supports Pagination', 'Whether this endpoint supports paginated fetching', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '45a82d17-8ce7-4329-877a-f613a6d13a5c' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'PaginationType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('45a82d17-8ce7-4329-877a-f613a6d13a5c', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'PaginationType', 'Pagination Type', 'Pagination strategy: PageNumber (page index), Offset (record offset), Cursor (opaque token), or None', 'nvarchar', 40, 0, 0, FALSE, 'PageNumber', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dee5e70d-93eb-4b6e-9d3b-1c14c318d725' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'SupportsIncrementalSync')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dee5e70d-93eb-4b6e-9d3b-1c14c318d725', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'SupportsIncrementalSync', 'Supports Incremental Sync', 'Whether this object supports watermark-based incremental sync', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dc6f770a-d31a-41cd-bbb3-1362bda880b0' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'SupportsWrite')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dc6f770a-d31a-41cd-bbb3-1362bda880b0', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'SupportsWrite', 'Supports Write', 'Whether data can be pushed back to this object via the API', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cef10f98-441a-4295-9317-b243475277fd' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'DefaultQueryParams')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cef10f98-441a-4295-9317-b243475277fd', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'DefaultQueryParams', 'Default Query Params', 'JSON object of default query parameters to include with every API request for this object', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'edc25016-6696-4001-bb01-a6cf7d65cae5' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('edc25016-6696-4001-bb01-a6cf7d65cae5', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'Configuration', 'Configuration', 'Freeform JSON for connector-specific configuration not covered by standard columns', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd579d52a-2ee9-4cf3-88a8-284ce92a6171' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d579d52a-2ee9-4cf3-88a8-284ce92a6171', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'Sequence', 'Sequence', 'Processing and display order. Lower numbers are processed first.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3c0706f7-ff1b-46fc-a9e1-2325eba3de7e' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3c0706f7-ff1b-46fc-a9e1-2325eba3de7e', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'Status', 'Status', 'Active, Deprecated, or Disabled. Mirrors EntityField status values.', 'nvarchar', 50, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7feac66f-2348-411e-b22a-8a32c1ac55a8' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'WriteAPIPath')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7feac66f-2348-411e-b22a-8a32c1ac55a8', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'WriteAPIPath', 'Write API Path', 'API path for create/update operations when different from the read APIPath. If NULL, the read APIPath is used for writes as well.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c3f0821-6297-4d02-90a8-0b704332a2ac' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'WriteMethod')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c3f0821-6297-4d02-90a8-0b704332a2ac', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'WriteMethod', 'Write Method', 'HTTP method for create operations. Defaults to POST.', 'nvarchar', 20, 0, 0, TRUE, 'POST', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9485116a-ca15-4d3a-8ac3-d7bd4f5f63d0' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'DeleteMethod')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9485116a-ca15-4d3a-8ac3-d7bd4f5f63d0', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'DeleteMethod', 'Delete Method', 'HTTP method for delete operations. Defaults to DELETE.', 'nvarchar', 20, 0, 0, TRUE, 'DELETE', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15c21343-cea7-4fa0-a2fd-5d159b9f3861' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'IsCustom')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('15c21343-cea7-4fa0-a2fd-5d159b9f3861', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'IsCustom', 'Is Custom', 'When true, this object was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '241534a8-70f3-4dfa-8a5a-37909df2ba1d' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'CreateAPIPath')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('241534a8-70f3-4dfa-8a5a-37909df2ba1d', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'CreateAPIPath', 'Create API Path', 'HTTP path template for create operations. Generic CRUD in BaseRESTIntegrationConnector substitutes parent IDs into {var} placeholders. NULL means create not supported via metadata-driven path.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af3f53cc-bee7-4e68-acab-4e59cd4913e0' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'CreateMethod')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('af3f53cc-bee7-4e68-acab-4e59cd4913e0', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'CreateMethod', 'Create Method', 'HTTP method for create (typically POST). NULL means create not supported via metadata-driven path.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40ac4e03-4321-4118-b42d-66cb9b6caf33' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'CreateBodyShape')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('40ac4e03-4321-4118-b42d-66cb9b6caf33', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'CreateBodyShape', 'Create Body Shape', 'Request body shape for create: flat (top-level fields), wrapped (under CreateBodyKey), or literal (connector overrides CreateRecord and supplies own body).', 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0a5afd09-1ac7-4a94-840d-80551d243a77' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'CreateBodyKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0a5afd09-1ac7-4a94-840d-80551d243a77', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'CreateBodyKey', 'Create Body Key', 'Wrapper key for create body when CreateBodyShape=wrapped. Example: ''member'' for YourMembership which wraps body as {member:{...}}.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '707156ac-99d7-457e-8e72-142c2e80cc7e' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'CreateIDLocation')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('707156ac-99d7-457e-8e72-142c2e80cc7e', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'CreateIDLocation', 'Create ID Location', 'Where the created record ID is found in the create response: path (URL of returned Location header), body (parsed from JSON response), header (specific named header).', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0aaf72cb-e783-4022-855b-eacdc22ff67c' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'UpdateAPIPath')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0aaf72cb-e783-4022-855b-eacdc22ff67c', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'UpdateAPIPath', 'Update API Path', 'HTTP path template for update operations. Typically contains {ID} placeholder substituted with the record ExternalID at runtime.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ba4ff9e5-09f9-43a0-8927-8f1f716e30f8' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'UpdateMethod')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ba4ff9e5-09f9-43a0-8927-8f1f716e30f8', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'UpdateMethod', 'Update Method', 'HTTP method for update (typically PATCH or PUT).', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '68f6fdf4-096d-456c-8d14-0f00ba8b5c81' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'UpdateBodyShape')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('68f6fdf4-096d-456c-8d14-0f00ba8b5c81', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'UpdateBodyShape', 'Update Body Shape', 'Request body shape for update: flat | wrapped | literal. See CreateBodyShape.', 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0f6bbea2-f077-451f-9dbe-ca1cde755a67' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'UpdateBodyKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0f6bbea2-f077-451f-9dbe-ca1cde755a67', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'UpdateBodyKey', 'Update Body Key', 'Wrapper key for update body when UpdateBodyShape=wrapped.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1e4b087b-f7d1-4e16-be36-cc732e3276b1' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'UpdateIDLocation')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1e4b087b-f7d1-4e16-be36-cc732e3276b1', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'UpdateIDLocation', 'Update ID Location', 'For update: where the target record ID is located in the request — typically ''path'' (substituted into UpdateAPIPath URL template).', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a4930718-50dd-486a-af4f-780d9f80d288' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'DeleteAPIPath')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a4930718-50dd-486a-af4f-780d9f80d288', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'DeleteAPIPath', 'Delete API Path', 'HTTP path template for delete operations. Typically contains {ID} placeholder. NULL means delete not supported via metadata-driven path. (Existing DeleteMethod column carries the verb.)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '845be607-43ef-4e44-9ad9-2b46be8778d3' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'DeleteIDLocation')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('845be607-43ef-4e44-9ad9-2b46be8778d3', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'DeleteIDLocation', 'Delete ID Location', 'For delete: where the target record ID is located — typically ''path''.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c979f76e-c2bf-4b33-9086-354f265cf9e2' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'IncrementalWatermarkField')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c979f76e-c2bf-4b33-9086-354f265cf9e2', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'IncrementalWatermarkField', 'Incremental Watermark Field', 'Vendor field name marking "last changed" — drives incremental sync filter when SupportsIncrementalSync=1. The exact filter syntax (e.g., $filter=Modified gt {value} or modified_since={value}) lives in Configuration.incrementalFilterFormat. Provable-only: leave NULL if docs do not name a watermark field.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '28b7beac-de05-4288-ab76-76be01577a9b' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'MetadataSource')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('28b7beac-de05-4288-ab76-76be01577a9b', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'MetadataSource', 'Metadata Source', 'Provenance of this CompanyIntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.', 'nvarchar', 40, 0, 0, FALSE, 'Declared', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f667abf4-3f36-468f-af2f-3e2af3dc245d' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'SupportsCreate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f667abf4-3f36-468f-af2f-3e2af3dc245d', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'SupportsCreate', 'Supports Create', 'Whether this object supports record creation in the external system (per-operation granularity beyond SupportsWrite). Drives whether the generic CreateRecord path is wired and whether the object is offered for write-back create.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '66dbd225-b2e1-4a6c-b319-8b35ad8fc191' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'SupportsUpdate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('66dbd225-b2e1-4a6c-b319-8b35ad8fc191', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'SupportsUpdate', 'Supports Update', 'Whether this object supports record updates in the external system (per-operation granularity beyond SupportsWrite).', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1fb8d585-3341-4c41-8ed8-6dd79da4c827' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'SupportsDelete')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1fb8d585-3341-4c41-8ed8-6dd79da4c827', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'SupportsDelete', 'Supports Delete', 'Whether this object supports record deletion/tombstoning in the external system (per-operation granularity beyond SupportsWrite).', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'edfdd822-2808-457b-8d89-d2a6e5486283' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'SyncStrategy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('edfdd822-2808-457b-8d89-d2a6e5486283', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'SyncStrategy', 'Sync Strategy', 'Declared incremental sync strategy for this object (e.g. WatermarkIncremental, ContentHash, FullSnapshot). Informs how the engine narrows subsequent syncs.', 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '915824e0-c086-4f28-876f-d9f5a0849b6c' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'ContentHashApplicable')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('915824e0-c086-4f28-876f-d9f5a0849b6c', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'ContentHashApplicable', 'Content Hash Applicable', 'Whether per-record content hashing is meaningful for this object (false for append-only/event streams where every row is new). Controls whether the engine uses content-hash to skip unchanged-row writes.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b90d39ca-efbc-4b14-a352-26c44f05be6e' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'StableOrderingKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b90d39ca-efbc-4b14-a352-26c44f05be6e', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'StableOrderingKey', 'Stable Ordering Key', 'Stable, monotonic ordering column (usually the PK) used for keyset/no-watermark resume of a scan. Null when the object has no stable key.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'abd44592-2ec6-45a4-91a2-a6aa7de62d6f' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'CompanyIntegrationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('abd44592-2ec6-45a4-91a2-a6aa7de62d6f', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'CompanyIntegrationID', 'Company Integration ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'DE238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9b4dc9c5-2c8d-43fb-a56a-da2baa3366b9' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'IntegrationObjectID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9b4dc9c5-2c8d-43fb-a56a-da2baa3366b9', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'IntegrationObjectID', 'Integration Object ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd42e167c-1e9c-4ef0-8d99-7208d251cf11' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'Provenance')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d42e167c-1e9c-4ef0-8d99-7208d251cf11', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'Provenance', 'Provenance', 'Where this row came from: Declared (the connector shipped catalog), Endpoint (the source listed it) or Sampled (only streaming records revealed it). Answers "whose is this" for a connection whose catalog no longer matches the connector default.', 'nvarchar', 40, 0, 0, FALSE, 'Declared', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '064b2c60-2312-421f-99b8-45e752e52ca8' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'ProvenanceDetail')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('064b2c60-2312-421f-99b8-45e752e52ca8', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'ProvenanceDetail', 'Provenance Detail', 'The per-attribute merge log for this row: which side won each overlay decision and why. The persist already computes this and throws it away, so the operator has never been able to see why a width or a key looks the way it does.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f8fa0212-2c88-4b7b-b2a5-c91720e9fdb4' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'IsSelected')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f8fa0212-2c88-4b7b-b2a5-c91720e9fdb4', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'IsSelected', 'Is Selected', 'Whether this connection syncs this item. THE AXIS THAT MAKES THE CONTRACT SATISFIABLE: Status says whether the item is in the catalog at all, IsSelected says whether the customer chose it. Conflating the two is why a newly discovered object had to arrive ENABLED — a disabled object was excluded from schema introspection, so it never reached key inference and never reached a migration.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '53bf6da6-a187-4d71-a990-411b85712296' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'SelectedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('53bf6da6-a187-4d71-a990-411b85712296', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'SelectedAt', 'Selected At', 'When the selection last changed. Lets the UI distinguish "never chosen" from "deliberately deselected".', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd836b032-97d7-4d8a-833f-5b197be0d7cf' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'FirstSeenAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d836b032-97d7-4d8a-833f-5b197be0d7cf', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'FirstSeenAt', 'First Seen At', 'When this connection first observed this item. Set once and never updated, so a catalog can be read as a history of what the source exposed and when.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6ebbafcc-b81c-4f2a-ae8a-cb32ecca1464' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'LastSeenAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6ebbafcc-b81c-4f2a-ae8a-cb32ecca1464', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'LastSeenAt', 'Last Seen At', 'When this connection most recently observed this item. A row whose LastSeenAt is older than the connection last discovery is what "absent from the source" means.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b82c2390-d728-4328-b8bb-dc4d6614a628' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'LastSampledAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b82c2390-d728-4328-b8bb-dc4d6614a628', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'LastSampledAt', 'Last Sampled At', 'When sampling last streamed records for this item. Distinct from LastSeenAt: an item can be listed by an endpoint without ever being sampled, and unsampled items are exactly the ones whose widths and keys came from the declared catalog rather than from data.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e2158cb0-d019-46be-808b-6870df948930' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e2158cb0-d019-46be-808b-6870df948930', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2a7e15ec-1590-4996-8621-8f98d2f0b49f' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2a7e15ec-1590-4996-8621-8f98d2f0b49f', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '24688f29-d02b-469a-9a0a-78341e7015f4' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('24688f29-d02b-469a-9a0a-78341e7015f4', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29e0f8f6-10d4-402a-a354-e072fbab8230' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29e0f8f6-10d4-402a-a354-e072fbab8230', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Name', 'Name', 'Field name as returned by the external API', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2fd7f3ae-c357-4382-98ef-7478ca3e7ede' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'DisplayName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2fd7f3ae-c357-4382-98ef-7478ca3e7ede', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'DisplayName', 'Display Name', 'Human-friendly display label for the field', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08097355-34de-4dcc-a05a-24690940e7e0' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('08097355-34de-4dcc-a05a-24690940e7e0', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Description', 'Description', 'Description of what this field represents', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ce012f0d-7b86-42be-a052-f9cd46743411' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Category')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ce012f0d-7b86-42be-a052-f9cd46743411', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Category', 'Category', 'UI grouping category within the object', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0e162f4d-c802-4f17-8006-cfdec81ce837' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Type')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0e162f4d-c802-4f17-8006-cfdec81ce837', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Type', 'Type', 'Data type of the field (e.g., nvarchar, int, datetime, decimal, bit). Uses same type vocabulary as EntityField.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '557b76b4-3241-4741-9c66-b18bc42d86af' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Length')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('557b76b4-3241-4741-9c66-b18bc42d86af', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Length', 'Length', 'Maximum length for string types', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8edc170-38d2-4725-a9ce-6ae9b9d1ef48' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Precision')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d8edc170-38d2-4725-a9ce-6ae9b9d1ef48', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Precision', 'Precision', 'Numeric precision', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b54d45f7-d0c0-4a3f-82a5-36ab576f9241' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Scale')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b54d45f7-d0c0-4a3f-82a5-36ab576f9241', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Scale', 'Scale', 'Numeric scale', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '99531a77-462f-4727-b7e1-88f924611102' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'AllowsNull')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('99531a77-462f-4727-b7e1-88f924611102', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'AllowsNull', 'Allows Null', 'Whether the field can contain NULL values', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b709b65a-70e6-4d58-802a-925f515bdf7c' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'DefaultValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b709b65a-70e6-4d58-802a-925f515bdf7c', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'DefaultValue', 'Default Value', 'Default value from the source system', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a0088e52-841d-40ca-a367-a9616be16d1e' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'IsPrimaryKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a0088e52-841d-40ca-a367-a9616be16d1e', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'IsPrimaryKey', 'Is Primary Key', 'Whether this field is part of the object primary key', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f017513d-1f90-43f4-812c-61209794bc7e' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'IsUniqueKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f017513d-1f90-43f4-812c-61209794bc7e', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'IsUniqueKey', 'Is Unique Key', 'Whether values must be unique across all records', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '606f96cc-e081-4e59-aa0a-886ac2046293' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'IsReadOnly')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('606f96cc-e081-4e59-aa0a-886ac2046293', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'IsReadOnly', 'Is Read Only', 'Whether this field cannot be written back to the source system', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '974f8c55-18da-43e7-9139-6b330b6d7e13' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'IsRequired')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('974f8c55-18da-43e7-9139-6b330b6d7e13', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'IsRequired', 'Is Required', 'Whether this field is required for create/update operations', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '57f93aee-da62-44ff-b09f-c11e27362b23' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'RelatedIntegrationObjectFieldName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('57f93aee-da62-44ff-b09f-c11e27362b23', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'RelatedIntegrationObjectFieldName', 'Related Integration Object Field Name', 'The field name on the related IntegrationObject that this FK points to (typically the PK field)', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9df9e3f9-d6de-4c74-a9a6-a761c924b87d' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9df9e3f9-d6de-4c74-a9a6-a761c924b87d', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Sequence', 'Sequence', 'Display and processing order within the object. Lower numbers appear first.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '913072cf-49a4-410a-9649-c1a916e0ee2f' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('913072cf-49a4-410a-9649-c1a916e0ee2f', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Configuration', 'Configuration', 'Freeform JSON for connector-specific field configuration', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad492f95-b325-425a-8370-33aaee0cab22' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad492f95-b325-425a-8370-33aaee0cab22', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Status', 'Status', 'Active, Deprecated, or Disabled. Mirrors EntityField status values.', 'nvarchar', 50, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '26b2bf39-cf02-407c-a8fd-be46df396edd' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'IsCustom')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('26b2bf39-cf02-407c-a8fd-be46df396edd', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'IsCustom', 'Is Custom', 'When true, this field was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f7c5ca70-f531-4c56-9827-6860b7214397' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'MetadataSource')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f7c5ca70-f531-4c56-9827-6860b7214397', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'MetadataSource', 'Metadata Source', 'Provenance of this CompanyIntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.', 'nvarchar', 40, 0, 0, FALSE, 'Declared', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8b96cddd-d560-44f3-922b-a60947326adf' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'CompanyIntegrationObjectID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8b96cddd-d560-44f3-922b-a60947326adf', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'CompanyIntegrationObjectID', 'Company Integration Object ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '3C30FA05-9490-49F0-8943-6052573C66B2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f3df5b72-312b-42ae-84bc-766a24d2d23a' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'RelatedCompanyIntegrationObjectID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f3df5b72-312b-42ae-84bc-766a24d2d23a', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'RelatedCompanyIntegrationObjectID', 'Related Company Integration Object ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '3C30FA05-9490-49F0-8943-6052573C66B2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4f599e5b-ec18-4c64-a703-c9288c9fd8e0' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'IntegrationObjectFieldID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4f599e5b-ec18-4c64-a703-c9288c9fd8e0', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'IntegrationObjectFieldID', 'Integration Object Field ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '3630CBFD-4C85-4B24-8A51-88D67389373E', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8a883aed-85e2-4e75-9f3b-e77be362060a' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'ObservedMaxLength')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8a883aed-85e2-4e75-9f3b-e77be362060a', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'ObservedMaxLength', 'Observed Max Length', 'The longest value sampling actually saw, kept SEPARATE from Length. Length carries the padded width the schema builder will use; this carries the evidence. Without both, a width cannot be audited and a truncation cannot be distinguished from a bad guess.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c938ab2b-08a0-4b4b-8a0a-d4891468d993' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'Provenance')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c938ab2b-08a0-4b4b-8a0a-d4891468d993', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'Provenance', 'Provenance', 'Where this row came from: Declared (the connector shipped catalog), Endpoint (the source listed it) or Sampled (only streaming records revealed it). Answers "whose is this" for a connection whose catalog no longer matches the connector default.', 'nvarchar', 40, 0, 0, FALSE, 'Declared', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fc40cce5-1013-4497-86ac-fc063fbe3017' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'ProvenanceDetail')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fc40cce5-1013-4497-86ac-fc063fbe3017', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'ProvenanceDetail', 'Provenance Detail', 'The per-attribute merge log for this row: which side won each overlay decision and why. The persist already computes this and throws it away, so the operator has never been able to see why a width or a key looks the way it does.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2b2d43b7-3603-486b-ab75-180835c97e47' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'IsSelected')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2b2d43b7-3603-486b-ab75-180835c97e47', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'IsSelected', 'Is Selected', 'Whether this connection syncs this item. THE AXIS THAT MAKES THE CONTRACT SATISFIABLE: Status says whether the item is in the catalog at all, IsSelected says whether the customer chose it. Conflating the two is why a newly discovered object had to arrive ENABLED — a disabled object was excluded from schema introspection, so it never reached key inference and never reached a migration.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2406202c-c8a8-48e1-b656-ae471e90444d' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'SelectedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2406202c-c8a8-48e1-b656-ae471e90444d', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'SelectedAt', 'Selected At', 'When the selection last changed. Lets the UI distinguish "never chosen" from "deliberately deselected".', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b0abe020-59ac-4084-81fc-a7d429913962' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'FirstSeenAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b0abe020-59ac-4084-81fc-a7d429913962', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'FirstSeenAt', 'First Seen At', 'When this connection first observed this item. Set once and never updated, so a catalog can be read as a history of what the source exposed and when.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88b368a0-c9bc-43c7-812d-bec153989ed1' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'LastSeenAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('88b368a0-c9bc-43c7-812d-bec153989ed1', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'LastSeenAt', 'Last Seen At', 'When this connection most recently observed this item. A row whose LastSeenAt is older than the connection last discovery is what "absent from the source" means.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1d2f7b68-831f-4f17-b3f4-c9d41cc87c13' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'LastSampledAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1d2f7b68-831f-4f17-b3f4-c9d41cc87c13', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'LastSampledAt', 'Last Sampled At', 'When sampling last streamed records for this item. Distinct from LastSeenAt: an item can be listed by an endpoint without ever being sampled, and unsampled items are exactly the ones whose widths and keys came from the declared catalog rather than from data.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '414682a2-eea2-46ca-bed1-b0a0d9b76df0' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('414682a2-eea2-46ca-bed1-b0a0d9b76df0', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6919d3b3-206e-4e69-b8b5-77ad4b68973b' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6919d3b3-206e-4e69-b8b5-77ad4b68973b', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 5ec4d75c-1813-4238-93e3-aa5fa8ca15c9 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5ec4d75c-1813-4238-93e3-aa5fa8ca15c9',
    'D42E167C-1E9C-4EF0-8D99-7208D251CF11',
    1,
    'Declared',
    'Declared',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 9cfba287-bfbc-472a-8bd6-7b59896051e9 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9cfba287-bfbc-472a-8bd6-7b59896051e9',
    'D42E167C-1E9C-4EF0-8D99-7208D251CF11',
    2,
    'Endpoint',
    'Endpoint',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 41e99c5d-6597-49af-9511-a6929ab02f56 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '41e99c5d-6597-49af-9511-a6929ab02f56',
    'D42E167C-1E9C-4EF0-8D99-7208D251CF11',
    3,
    'Sampled',
    'Sampled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID D42E167C-1E9C-4EF0-8D99-7208D251CF11 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D42E167C-1E9C-4EF0-8D99-7208D251CF11';
/* SQL text to insert entity field value with ID b88992e1-89ad-4a54-afae-212bc49dda3c */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b88992e1-89ad-4a54-afae-212bc49dda3c',
    '3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 97dfe4c3-d118-435e-8659-917e181fd28c */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '97dfe4c3-d118-435e-8659-917e181fd28c',
    '3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E',
    2,
    'Deprecated',
    'Deprecated',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID aa4e41f1-ff4f-4b9c-9395-c37d63ccde03 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'aa4e41f1-ff4f-4b9c-9395-c37d63ccde03',
    '3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E',
    3,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E';
/* SQL text to insert entity field value with ID 8b0b9d8a-15b6-4831-b54c-efaff1cf5c20 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8b0b9d8a-15b6-4831-b54c-efaff1cf5c20',
    '28B7BEAC-DE05-4288-AB76-76BE01577A9B',
    1,
    'Custom',
    'Custom',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e3663f3b-9bdd-497d-8142-733e23e69b31 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e3663f3b-9bdd-497d-8142-733e23e69b31',
    '28B7BEAC-DE05-4288-AB76-76BE01577A9B',
    2,
    'Declared',
    'Declared',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 27db8169-8521-4d58-aa35-94d351f68094 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '27db8169-8521-4d58-aa35-94d351f68094',
    '28B7BEAC-DE05-4288-AB76-76BE01577A9B',
    3,
    'Discovered',
    'Discovered',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 28B7BEAC-DE05-4288-AB76-76BE01577A9B */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '28B7BEAC-DE05-4288-AB76-76BE01577A9B';
/* SQL text to insert entity field value with ID ffe6ab0c-c134-466d-83fe-28ab29031291 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ffe6ab0c-c134-466d-83fe-28ab29031291',
    'C938AB2B-08A0-4B4B-8A0A-D4891468D993',
    1,
    'Declared',
    'Declared',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5263c9cb-1ddc-4beb-b0a8-f64b3217bf9a */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5263c9cb-1ddc-4beb-b0a8-f64b3217bf9a',
    'C938AB2B-08A0-4B4B-8A0A-D4891468D993',
    2,
    'Endpoint',
    'Endpoint',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8f2fc18c-faab-4a05-9d38-194fd88b61e3 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8f2fc18c-faab-4a05-9d38-194fd88b61e3',
    'C938AB2B-08A0-4B4B-8A0A-D4891468D993',
    3,
    'Sampled',
    'Sampled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID C938AB2B-08A0-4B4B-8A0A-D4891468D993 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'C938AB2B-08A0-4B4B-8A0A-D4891468D993';
/* SQL text to insert entity field value with ID 7c5845ad-3a8d-41c3-8a4b-2dc0e0e5facb */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7c5845ad-3a8d-41c3-8a4b-2dc0e0e5facb',
    'AD492F95-B325-425A-8370-33AAEE0CAB22',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 17f83105-daf7-4281-b55a-1db9ef7a1f60 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '17f83105-daf7-4281-b55a-1db9ef7a1f60',
    'AD492F95-B325-425A-8370-33AAEE0CAB22',
    2,
    'Deprecated',
    'Deprecated',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bc17f055-2701-46b4-a750-39f5f084000c */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bc17f055-2701-46b4-a750-39f5f084000c',
    'AD492F95-B325-425A-8370-33AAEE0CAB22',
    3,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID AD492F95-B325-425A-8370-33AAEE0CAB22 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'AD492F95-B325-425A-8370-33AAEE0CAB22';
/* SQL text to insert entity field value with ID 3bbabdb1-9af7-4b84-9548-c8a6ca7d2ef5 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '3bbabdb1-9af7-4b84-9548-c8a6ca7d2ef5',
    'F7C5CA70-F531-4C56-9827-6860B7214397',
    1,
    'Custom',
    'Custom',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID fa9a47e6-234d-4dff-90cf-2d9eafad78a9 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'fa9a47e6-234d-4dff-90cf-2d9eafad78a9',
    'F7C5CA70-F531-4C56-9827-6860B7214397',
    2,
    'Declared',
    'Declared',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID fe537995-08b8-41d9-9040-971b5d359d3a */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'fe537995-08b8-41d9-9040-971b5d359d3a',
    'F7C5CA70-F531-4C56-9827-6860B7214397',
    3,
    'Discovered',
    'Discovered',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID F7C5CA70-F531-4C56-9827-6860B7214397 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'F7C5CA70-F531-4C56-9827-6860B7214397';
/* Create Entity Relationship: MJ: Integrations -> MJ: Company Integration Objects (One To Many via IntegrationID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '31bcda52-f202-46ce-9711-76464b831948') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('31bcda52-f202-46ce-9711-76464b831948', 'DD238F34-2837-EF11-86D4-6045BDEE16E6', '3C30FA05-9490-49F0-8943-6052573C66B2', 'IntegrationID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5056e1cc-5d51-4391-86ba-2f3d37ab29f2') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5056e1cc-5d51-4391-86ba-2f3d37ab29f2', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', '3C30FA05-9490-49F0-8943-6052573C66B2', 'CompanyIntegrationID', 'One To Many', TRUE, TRUE, 7, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '71dd63fc-078f-4ea0-8b21-34fa6f4f9b64') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('71dd63fc-078f-4ea0-8b21-34fa6f4f9b64', '3C30FA05-9490-49F0-8943-6052573C66B2', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', 'CompanyIntegrationObjectID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'add4c33f-87f4-4658-82a2-e66b14348fcb') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('add4c33f-87f4-4658-82a2-e66b14348fcb', '3C30FA05-9490-49F0-8943-6052573C66B2', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', 'RelatedCompanyIntegrationObjectID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f83563b6-3e7a-4391-8d49-283b42bd14fc') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f83563b6-3e7a-4391-8d49-283b42bd14fc', '3630CBFD-4C85-4B24-8A51-88D67389373E', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', 'IntegrationObjectFieldID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a34b681b-96e0-423d-85ac-ded72da90104') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a34b681b-96e0-423d-85ac-ded72da90104', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', '3C30FA05-9490-49F0-8943-6052573C66B2', 'IntegrationObjectID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '294e1eef-929c-4452-84d4-ab24a71fe6d6' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'Integration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('294e1eef-929c-4452-84d4-ab24a71fe6d6', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'Integration', 'Integration', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '00a0fe69-4349-4b82-9985-03d84c762d57' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'CompanyIntegration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('00a0fe69-4349-4b82-9985-03d84c762d57', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'CompanyIntegration', 'Company Integration', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '155a8c38-a86d-4c24-94b6-a0537d7c560c' OR ("EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2' AND "Name" = 'IntegrationObject')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('155a8c38-a86d-4c24-94b6-a0537d7c560c', '3C30FA05-9490-49F0-8943-6052573C66B2' /* Entity: MJ: Company Integration Objects */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3C30FA05-9490-49F0-8943-6052573C66B2'), 'IntegrationObject', 'Integration Object', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '738d3325-4543-4a33-977d-826195d21d6a' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'CompanyIntegrationObject')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('738d3325-4543-4a33-977d-826195d21d6a', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'CompanyIntegrationObject', 'Company Integration Object', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9e2bf4cb-cc40-4688-9596-cf8fcc48951d' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'RelatedCompanyIntegrationObject')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9e2bf4cb-cc40-4688-9596-cf8fcc48951d', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'RelatedCompanyIntegrationObject', 'Related Company Integration Object', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9b74e1d4-e18f-4108-9992-2f30224d1e15' OR ("EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND "Name" = 'IntegrationObjectField')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9b74e1d4-e18f-4108-9992-2f30224d1e15', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' /* Entity: MJ: Company Integration Object Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'), 'IntegrationObjectField', 'Integration Object Field', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Object Fields
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_object_field_company_integ"
    ON "__mj"."CompanyIntegrationObjectField" ("CompanyIntegrationObjectID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_object_field_related_compa"
    ON "__mj"."CompanyIntegrationObjectField" ("RelatedCompanyIntegrationObjectID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_object_field_integration_o"
    ON "__mj"."CompanyIntegrationObjectField" ("IntegrationObjectFieldID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Object Fields
-- Item: vwCompanyIntegrationObjectFields
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Object Fields
-----               SCHEMA:      __mj
-----               BASE TABLE:  CompanyIntegrationObjectField
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwCompanyIntegrationObjectFields"
AS
SELECT
    c.*,
    MJCompanyIntegrationObject_CompanyIntegrationObjectID."Name" AS "CompanyIntegrationObject",
    MJCompanyIntegrationObject_RelatedCompanyIntegrationObjectID."Name" AS "RelatedCompanyIntegrationObject",
    MJIntegrationObjectField_IntegrationObjectFieldID."Name" AS "IntegrationObjectField"
FROM
    "__mj"."CompanyIntegrationObjectField" AS c
INNER JOIN
    "__mj"."CompanyIntegrationObject" AS MJCompanyIntegrationObject_CompanyIntegrationObjectID
  ON
    "c"."CompanyIntegrationObjectID" = MJCompanyIntegrationObject_CompanyIntegrationObjectID."ID"
LEFT OUTER JOIN
    "__mj"."CompanyIntegrationObject" AS MJCompanyIntegrationObject_RelatedCompanyIntegrationObjectID
  ON
    "c"."RelatedCompanyIntegrationObjectID" = MJCompanyIntegrationObject_RelatedCompanyIntegrationObjectID."ID"
LEFT OUTER JOIN
    "__mj"."IntegrationObjectField" AS MJIntegrationObjectField_IntegrationObjectFieldID
  ON
    "c"."IntegrationObjectFieldID" = MJIntegrationObjectField_IntegrationObjectFieldID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwCompanyIntegrationObjectFields'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwCompanyIntegrationObjectFields'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwCompanyIntegrationObjectFields" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwCompanyIntegrationObjectFields" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCompanyIntegrationObjectFields" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwCompanyIntegrationObjectFields" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Object Fields
-- Item: spCreateCompanyIntegrationObjectField
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CompanyIntegrationObjectField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCompanyIntegrationObjectField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCompanyIntegrationObjectField"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_type varchar(100) DEFAULT NULL,
    p_length_clear boolean DEFAULT false,
    p_length int DEFAULT NULL,
    p_precision_clear boolean DEFAULT false,
    p_precision int DEFAULT NULL,
    p_scale_clear boolean DEFAULT false,
    p_scale int DEFAULT NULL,
    p_allowsnull BOOLEAN DEFAULT NULL,
    p_defaultvalue_clear boolean DEFAULT false,
    p_defaultvalue varchar(255) DEFAULT NULL,
    p_isprimarykey BOOLEAN DEFAULT NULL,
    p_isuniquekey BOOLEAN DEFAULT NULL,
    p_isreadonly BOOLEAN DEFAULT NULL,
    p_isrequired BOOLEAN DEFAULT NULL,
    p_relatedintegrationobjectfieldname_clear boolean DEFAULT false,
    p_relatedintegrationobjectfieldname varchar(255) DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_iscustom BOOLEAN DEFAULT NULL,
    p_metadatasource varchar(20) DEFAULT NULL,
    p_companyintegrationobjectid UUID DEFAULT NULL,
    p_relatedcompanyintegrationobjectid_clear boolean DEFAULT false,
    p_relatedcompanyintegrationobjectid UUID DEFAULT NULL,
    p_integrationobjectfieldid_clear boolean DEFAULT false,
    p_integrationobjectfieldid UUID DEFAULT NULL,
    p_observedmaxlength_clear boolean DEFAULT false,
    p_observedmaxlength int DEFAULT NULL,
    p_provenance varchar(20) DEFAULT NULL,
    p_provenancedetail_clear boolean DEFAULT false,
    p_provenancedetail TEXT DEFAULT NULL,
    p_isselected BOOLEAN DEFAULT NULL,
    p_selectedat_clear boolean DEFAULT false,
    p_selectedat TIMESTAMPTZ DEFAULT NULL,
    p_firstseenat_clear boolean DEFAULT false,
    p_firstseenat TIMESTAMPTZ DEFAULT NULL,
    p_lastseenat_clear boolean DEFAULT false,
    p_lastseenat TIMESTAMPTZ DEFAULT NULL,
    p_lastsampledat_clear boolean DEFAULT false,
    p_lastsampledat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationObjectFields" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CompanyIntegrationObjectField"
        (
            "ID",
            "Name",
                "DisplayName",
                "Description",
                "Category",
                "Type",
                "Length",
                "Precision",
                "Scale",
                "AllowsNull",
                "DefaultValue",
                "IsPrimaryKey",
                "IsUniqueKey",
                "IsReadOnly",
                "IsRequired",
                "RelatedIntegrationObjectFieldName",
                "Sequence",
                "Configuration",
                "Status",
                "IsCustom",
                "MetadataSource",
                "CompanyIntegrationObjectID",
                "RelatedCompanyIntegrationObjectID",
                "IntegrationObjectFieldID",
                "ObservedMaxLength",
                "Provenance",
                "ProvenanceDetail",
                "IsSelected",
                "SelectedAt",
                "FirstSeenAt",
                "LastSeenAt",
                "LastSampledAt"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, NULL) END,
                p_type,
                CASE WHEN p_length_clear = true THEN NULL ELSE COALESCE(p_length, NULL) END,
                CASE WHEN p_precision_clear = true THEN NULL ELSE COALESCE(p_precision, NULL) END,
                CASE WHEN p_scale_clear = true THEN NULL ELSE COALESCE(p_scale, NULL) END,
                COALESCE(p_allowsnull, TRUE),
                CASE WHEN p_defaultvalue_clear = true THEN NULL ELSE COALESCE(p_defaultvalue, NULL) END,
                COALESCE(p_isprimarykey, FALSE),
                COALESCE(p_isuniquekey, FALSE),
                COALESCE(p_isreadonly, FALSE),
                COALESCE(p_isrequired, FALSE),
                CASE WHEN p_relatedintegrationobjectfieldname_clear = true THEN NULL ELSE COALESCE(p_relatedintegrationobjectfieldname, NULL) END,
                COALESCE(p_sequence, 0),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_iscustom, FALSE),
                COALESCE(p_metadatasource, 'Declared'),
                p_companyintegrationobjectid,
                CASE WHEN p_relatedcompanyintegrationobjectid_clear = true THEN NULL ELSE COALESCE(p_relatedcompanyintegrationobjectid, NULL) END,
                CASE WHEN p_integrationobjectfieldid_clear = true THEN NULL ELSE COALESCE(p_integrationobjectfieldid, NULL) END,
                CASE WHEN p_observedmaxlength_clear = true THEN NULL ELSE COALESCE(p_observedmaxlength, NULL) END,
                COALESCE(p_provenance, 'Declared'),
                CASE WHEN p_provenancedetail_clear = true THEN NULL ELSE COALESCE(p_provenancedetail, NULL) END,
                COALESCE(p_isselected, FALSE),
                CASE WHEN p_selectedat_clear = true THEN NULL ELSE COALESCE(p_selectedat, NULL) END,
                CASE WHEN p_firstseenat_clear = true THEN NULL ELSE COALESCE(p_firstseenat, NULL) END,
                CASE WHEN p_lastseenat_clear = true THEN NULL ELSE COALESCE(p_lastseenat, NULL) END,
                CASE WHEN p_lastsampledat_clear = true THEN NULL ELSE COALESCE(p_lastsampledat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationObjectFields"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationObjectField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationObjectField" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Object Fields
-- Item: spUpdateCompanyIntegrationObjectField
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CompanyIntegrationObjectField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCompanyIntegrationObjectField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCompanyIntegrationObjectField"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_type varchar(100) DEFAULT NULL,
    p_length_clear boolean DEFAULT false,
    p_length int DEFAULT NULL,
    p_precision_clear boolean DEFAULT false,
    p_precision int DEFAULT NULL,
    p_scale_clear boolean DEFAULT false,
    p_scale int DEFAULT NULL,
    p_allowsnull BOOLEAN DEFAULT NULL,
    p_defaultvalue_clear boolean DEFAULT false,
    p_defaultvalue varchar(255) DEFAULT NULL,
    p_isprimarykey BOOLEAN DEFAULT NULL,
    p_isuniquekey BOOLEAN DEFAULT NULL,
    p_isreadonly BOOLEAN DEFAULT NULL,
    p_isrequired BOOLEAN DEFAULT NULL,
    p_relatedintegrationobjectfieldname_clear boolean DEFAULT false,
    p_relatedintegrationobjectfieldname varchar(255) DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_iscustom BOOLEAN DEFAULT NULL,
    p_metadatasource varchar(20) DEFAULT NULL,
    p_companyintegrationobjectid UUID DEFAULT NULL,
    p_relatedcompanyintegrationobjectid_clear boolean DEFAULT false,
    p_relatedcompanyintegrationobjectid UUID DEFAULT NULL,
    p_integrationobjectfieldid_clear boolean DEFAULT false,
    p_integrationobjectfieldid UUID DEFAULT NULL,
    p_observedmaxlength_clear boolean DEFAULT false,
    p_observedmaxlength int DEFAULT NULL,
    p_provenance varchar(20) DEFAULT NULL,
    p_provenancedetail_clear boolean DEFAULT false,
    p_provenancedetail TEXT DEFAULT NULL,
    p_isselected BOOLEAN DEFAULT NULL,
    p_selectedat_clear boolean DEFAULT false,
    p_selectedat TIMESTAMPTZ DEFAULT NULL,
    p_firstseenat_clear boolean DEFAULT false,
    p_firstseenat TIMESTAMPTZ DEFAULT NULL,
    p_lastseenat_clear boolean DEFAULT false,
    p_lastseenat TIMESTAMPTZ DEFAULT NULL,
    p_lastsampledat_clear boolean DEFAULT false,
    p_lastsampledat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationObjectFields" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CompanyIntegrationObjectField"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Category" = CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, "Category") END,
        "Type" = COALESCE(p_type, "Type"),
        "Length" = CASE WHEN p_length_clear = true THEN NULL ELSE COALESCE(p_length, "Length") END,
        "Precision" = CASE WHEN p_precision_clear = true THEN NULL ELSE COALESCE(p_precision, "Precision") END,
        "Scale" = CASE WHEN p_scale_clear = true THEN NULL ELSE COALESCE(p_scale, "Scale") END,
        "AllowsNull" = COALESCE(p_allowsnull, "AllowsNull"),
        "DefaultValue" = CASE WHEN p_defaultvalue_clear = true THEN NULL ELSE COALESCE(p_defaultvalue, "DefaultValue") END,
        "IsPrimaryKey" = COALESCE(p_isprimarykey, "IsPrimaryKey"),
        "IsUniqueKey" = COALESCE(p_isuniquekey, "IsUniqueKey"),
        "IsReadOnly" = COALESCE(p_isreadonly, "IsReadOnly"),
        "IsRequired" = COALESCE(p_isrequired, "IsRequired"),
        "RelatedIntegrationObjectFieldName" = CASE WHEN p_relatedintegrationobjectfieldname_clear = true THEN NULL ELSE COALESCE(p_relatedintegrationobjectfieldname, "RelatedIntegrationObjectFieldName") END,
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "Status" = COALESCE(p_status, "Status"),
        "IsCustom" = COALESCE(p_iscustom, "IsCustom"),
        "MetadataSource" = COALESCE(p_metadatasource, "MetadataSource"),
        "CompanyIntegrationObjectID" = COALESCE(p_companyintegrationobjectid, "CompanyIntegrationObjectID"),
        "RelatedCompanyIntegrationObjectID" = CASE WHEN p_relatedcompanyintegrationobjectid_clear = true THEN NULL ELSE COALESCE(p_relatedcompanyintegrationobjectid, "RelatedCompanyIntegrationObjectID") END,
        "IntegrationObjectFieldID" = CASE WHEN p_integrationobjectfieldid_clear = true THEN NULL ELSE COALESCE(p_integrationobjectfieldid, "IntegrationObjectFieldID") END,
        "ObservedMaxLength" = CASE WHEN p_observedmaxlength_clear = true THEN NULL ELSE COALESCE(p_observedmaxlength, "ObservedMaxLength") END,
        "Provenance" = COALESCE(p_provenance, "Provenance"),
        "ProvenanceDetail" = CASE WHEN p_provenancedetail_clear = true THEN NULL ELSE COALESCE(p_provenancedetail, "ProvenanceDetail") END,
        "IsSelected" = COALESCE(p_isselected, "IsSelected"),
        "SelectedAt" = CASE WHEN p_selectedat_clear = true THEN NULL ELSE COALESCE(p_selectedat, "SelectedAt") END,
        "FirstSeenAt" = CASE WHEN p_firstseenat_clear = true THEN NULL ELSE COALESCE(p_firstseenat, "FirstSeenAt") END,
        "LastSeenAt" = CASE WHEN p_lastseenat_clear = true THEN NULL ELSE COALESCE(p_lastseenat, "LastSeenAt") END,
        "LastSampledAt" = CASE WHEN p_lastsampledat_clear = true THEN NULL ELSE COALESCE(p_lastsampledat, "LastSampledAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationObjectFields"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationObjectField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationObjectField" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationObjectField table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_company_integration_object_field"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_company_integration_object_field" ON "__mj"."CompanyIntegrationObjectField";

CREATE TRIGGER "trg_update_company_integration_object_field"
BEFORE UPDATE ON "__mj"."CompanyIntegrationObjectField"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_company_integration_object_field"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Object Fields
-- Item: spDeleteCompanyIntegrationObjectField
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CompanyIntegrationObjectField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCompanyIntegrationObjectField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCompanyIntegrationObjectField"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CompanyIntegrationObjectField"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationObjectField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationObjectField" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Objects
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_object_integration_id"
    ON "__mj"."CompanyIntegrationObject" ("IntegrationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_object_company_integration"
    ON "__mj"."CompanyIntegrationObject" ("CompanyIntegrationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_object_integration_object_"
    ON "__mj"."CompanyIntegrationObject" ("IntegrationObjectID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Objects
-- Item: vwCompanyIntegrationObjects
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Objects
-----               SCHEMA:      __mj
-----               BASE TABLE:  CompanyIntegrationObject
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwCompanyIntegrationObjects"
AS
SELECT
    c.*,
    MJIntegration_IntegrationID."Name" AS "Integration",
    MJCompanyIntegration_CompanyIntegrationID."Name" AS "CompanyIntegration",
    MJIntegrationObject_IntegrationObjectID."Name" AS "IntegrationObject"
FROM
    "__mj"."CompanyIntegrationObject" AS c
INNER JOIN
    "__mj"."Integration" AS MJIntegration_IntegrationID
  ON
    "c"."IntegrationID" = MJIntegration_IntegrationID."ID"
INNER JOIN
    "__mj"."CompanyIntegration" AS MJCompanyIntegration_CompanyIntegrationID
  ON
    "c"."CompanyIntegrationID" = MJCompanyIntegration_CompanyIntegrationID."ID"
LEFT OUTER JOIN
    "__mj"."IntegrationObject" AS MJIntegrationObject_IntegrationObjectID
  ON
    "c"."IntegrationObjectID" = MJIntegrationObject_IntegrationObjectID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwCompanyIntegrationObjects'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwCompanyIntegrationObjects'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwCompanyIntegrationObjects" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwCompanyIntegrationObjects" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCompanyIntegrationObjects" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwCompanyIntegrationObjects" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Objects
-- Item: spCreateCompanyIntegrationObject
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CompanyIntegrationObject
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCompanyIntegrationObject'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCompanyIntegrationObject"(
    p_id UUID DEFAULT NULL,
    p_integrationid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_apipath varchar(500) DEFAULT NULL,
    p_responsedatakey_clear boolean DEFAULT false,
    p_responsedatakey varchar(255) DEFAULT NULL,
    p_defaultpagesize int DEFAULT NULL,
    p_supportspagination BOOLEAN DEFAULT NULL,
    p_paginationtype varchar(20) DEFAULT NULL,
    p_supportsincrementalsync BOOLEAN DEFAULT NULL,
    p_supportswrite BOOLEAN DEFAULT NULL,
    p_defaultqueryparams_clear boolean DEFAULT false,
    p_defaultqueryparams TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_writeapipath_clear boolean DEFAULT false,
    p_writeapipath varchar(500) DEFAULT NULL,
    p_writemethod_clear boolean DEFAULT false,
    p_writemethod varchar(10) DEFAULT NULL,
    p_deletemethod_clear boolean DEFAULT false,
    p_deletemethod varchar(10) DEFAULT NULL,
    p_iscustom BOOLEAN DEFAULT NULL,
    p_createapipath_clear boolean DEFAULT false,
    p_createapipath TEXT DEFAULT NULL,
    p_createmethod_clear boolean DEFAULT false,
    p_createmethod varchar(20) DEFAULT NULL,
    p_createbodyshape_clear boolean DEFAULT false,
    p_createbodyshape varchar(50) DEFAULT NULL,
    p_createbodykey_clear boolean DEFAULT false,
    p_createbodykey varchar(100) DEFAULT NULL,
    p_createidlocation_clear boolean DEFAULT false,
    p_createidlocation varchar(20) DEFAULT NULL,
    p_updateapipath_clear boolean DEFAULT false,
    p_updateapipath TEXT DEFAULT NULL,
    p_updatemethod_clear boolean DEFAULT false,
    p_updatemethod varchar(20) DEFAULT NULL,
    p_updatebodyshape_clear boolean DEFAULT false,
    p_updatebodyshape varchar(50) DEFAULT NULL,
    p_updatebodykey_clear boolean DEFAULT false,
    p_updatebodykey varchar(100) DEFAULT NULL,
    p_updateidlocation_clear boolean DEFAULT false,
    p_updateidlocation varchar(20) DEFAULT NULL,
    p_deleteapipath_clear boolean DEFAULT false,
    p_deleteapipath TEXT DEFAULT NULL,
    p_deleteidlocation_clear boolean DEFAULT false,
    p_deleteidlocation varchar(20) DEFAULT NULL,
    p_incrementalwatermarkfield_clear boolean DEFAULT false,
    p_incrementalwatermarkfield varchar(255) DEFAULT NULL,
    p_metadatasource varchar(20) DEFAULT NULL,
    p_supportscreate BOOLEAN DEFAULT NULL,
    p_supportsupdate BOOLEAN DEFAULT NULL,
    p_supportsdelete BOOLEAN DEFAULT NULL,
    p_syncstrategy_clear boolean DEFAULT false,
    p_syncstrategy varchar(50) DEFAULT NULL,
    p_contenthashapplicable BOOLEAN DEFAULT NULL,
    p_stableorderingkey_clear boolean DEFAULT false,
    p_stableorderingkey varchar(255) DEFAULT NULL,
    p_companyintegrationid UUID DEFAULT NULL,
    p_integrationobjectid_clear boolean DEFAULT false,
    p_integrationobjectid UUID DEFAULT NULL,
    p_provenance varchar(20) DEFAULT NULL,
    p_provenancedetail_clear boolean DEFAULT false,
    p_provenancedetail TEXT DEFAULT NULL,
    p_isselected BOOLEAN DEFAULT NULL,
    p_selectedat_clear boolean DEFAULT false,
    p_selectedat TIMESTAMPTZ DEFAULT NULL,
    p_firstseenat_clear boolean DEFAULT false,
    p_firstseenat TIMESTAMPTZ DEFAULT NULL,
    p_lastseenat_clear boolean DEFAULT false,
    p_lastseenat TIMESTAMPTZ DEFAULT NULL,
    p_lastsampledat_clear boolean DEFAULT false,
    p_lastsampledat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationObjects" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CompanyIntegrationObject"
        (
            "ID",
            "IntegrationID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "APIPath",
                "ResponseDataKey",
                "DefaultPageSize",
                "SupportsPagination",
                "PaginationType",
                "SupportsIncrementalSync",
                "SupportsWrite",
                "DefaultQueryParams",
                "Configuration",
                "Sequence",
                "Status",
                "WriteAPIPath",
                "WriteMethod",
                "DeleteMethod",
                "IsCustom",
                "CreateAPIPath",
                "CreateMethod",
                "CreateBodyShape",
                "CreateBodyKey",
                "CreateIDLocation",
                "UpdateAPIPath",
                "UpdateMethod",
                "UpdateBodyShape",
                "UpdateBodyKey",
                "UpdateIDLocation",
                "DeleteAPIPath",
                "DeleteIDLocation",
                "IncrementalWatermarkField",
                "MetadataSource",
                "SupportsCreate",
                "SupportsUpdate",
                "SupportsDelete",
                "SyncStrategy",
                "ContentHashApplicable",
                "StableOrderingKey",
                "CompanyIntegrationID",
                "IntegrationObjectID",
                "Provenance",
                "ProvenanceDetail",
                "IsSelected",
                "SelectedAt",
                "FirstSeenAt",
                "LastSeenAt",
                "LastSampledAt"
        )
    VALUES
        (
            v_new_id,
            p_integrationid,
                p_name,
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, NULL) END,
                p_apipath,
                CASE WHEN p_responsedatakey_clear = true THEN NULL ELSE COALESCE(p_responsedatakey, NULL) END,
                COALESCE(p_defaultpagesize, 100),
                COALESCE(p_supportspagination, TRUE),
                COALESCE(p_paginationtype, 'PageNumber'),
                COALESCE(p_supportsincrementalsync, FALSE),
                COALESCE(p_supportswrite, FALSE),
                CASE WHEN p_defaultqueryparams_clear = true THEN NULL ELSE COALESCE(p_defaultqueryparams, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                COALESCE(p_sequence, 0),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_writeapipath_clear = true THEN NULL ELSE COALESCE(p_writeapipath, NULL) END,
                CASE WHEN p_writemethod_clear = true THEN NULL ELSE COALESCE(p_writemethod, 'POST') END,
                CASE WHEN p_deletemethod_clear = true THEN NULL ELSE COALESCE(p_deletemethod, 'DELETE') END,
                COALESCE(p_iscustom, FALSE),
                CASE WHEN p_createapipath_clear = true THEN NULL ELSE COALESCE(p_createapipath, NULL) END,
                CASE WHEN p_createmethod_clear = true THEN NULL ELSE COALESCE(p_createmethod, NULL) END,
                CASE WHEN p_createbodyshape_clear = true THEN NULL ELSE COALESCE(p_createbodyshape, NULL) END,
                CASE WHEN p_createbodykey_clear = true THEN NULL ELSE COALESCE(p_createbodykey, NULL) END,
                CASE WHEN p_createidlocation_clear = true THEN NULL ELSE COALESCE(p_createidlocation, NULL) END,
                CASE WHEN p_updateapipath_clear = true THEN NULL ELSE COALESCE(p_updateapipath, NULL) END,
                CASE WHEN p_updatemethod_clear = true THEN NULL ELSE COALESCE(p_updatemethod, NULL) END,
                CASE WHEN p_updatebodyshape_clear = true THEN NULL ELSE COALESCE(p_updatebodyshape, NULL) END,
                CASE WHEN p_updatebodykey_clear = true THEN NULL ELSE COALESCE(p_updatebodykey, NULL) END,
                CASE WHEN p_updateidlocation_clear = true THEN NULL ELSE COALESCE(p_updateidlocation, NULL) END,
                CASE WHEN p_deleteapipath_clear = true THEN NULL ELSE COALESCE(p_deleteapipath, NULL) END,
                CASE WHEN p_deleteidlocation_clear = true THEN NULL ELSE COALESCE(p_deleteidlocation, NULL) END,
                CASE WHEN p_incrementalwatermarkfield_clear = true THEN NULL ELSE COALESCE(p_incrementalwatermarkfield, NULL) END,
                COALESCE(p_metadatasource, 'Declared'),
                COALESCE(p_supportscreate, FALSE),
                COALESCE(p_supportsupdate, FALSE),
                COALESCE(p_supportsdelete, FALSE),
                CASE WHEN p_syncstrategy_clear = true THEN NULL ELSE COALESCE(p_syncstrategy, NULL) END,
                COALESCE(p_contenthashapplicable, TRUE),
                CASE WHEN p_stableorderingkey_clear = true THEN NULL ELSE COALESCE(p_stableorderingkey, NULL) END,
                p_companyintegrationid,
                CASE WHEN p_integrationobjectid_clear = true THEN NULL ELSE COALESCE(p_integrationobjectid, NULL) END,
                COALESCE(p_provenance, 'Declared'),
                CASE WHEN p_provenancedetail_clear = true THEN NULL ELSE COALESCE(p_provenancedetail, NULL) END,
                COALESCE(p_isselected, FALSE),
                CASE WHEN p_selectedat_clear = true THEN NULL ELSE COALESCE(p_selectedat, NULL) END,
                CASE WHEN p_firstseenat_clear = true THEN NULL ELSE COALESCE(p_firstseenat, NULL) END,
                CASE WHEN p_lastseenat_clear = true THEN NULL ELSE COALESCE(p_lastseenat, NULL) END,
                CASE WHEN p_lastsampledat_clear = true THEN NULL ELSE COALESCE(p_lastsampledat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationObjects"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationObject" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationObject" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Objects
-- Item: spUpdateCompanyIntegrationObject
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CompanyIntegrationObject
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCompanyIntegrationObject'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCompanyIntegrationObject"(
    p_id UUID,
    p_integrationid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_apipath varchar(500) DEFAULT NULL,
    p_responsedatakey_clear boolean DEFAULT false,
    p_responsedatakey varchar(255) DEFAULT NULL,
    p_defaultpagesize int DEFAULT NULL,
    p_supportspagination BOOLEAN DEFAULT NULL,
    p_paginationtype varchar(20) DEFAULT NULL,
    p_supportsincrementalsync BOOLEAN DEFAULT NULL,
    p_supportswrite BOOLEAN DEFAULT NULL,
    p_defaultqueryparams_clear boolean DEFAULT false,
    p_defaultqueryparams TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_writeapipath_clear boolean DEFAULT false,
    p_writeapipath varchar(500) DEFAULT NULL,
    p_writemethod_clear boolean DEFAULT false,
    p_writemethod varchar(10) DEFAULT NULL,
    p_deletemethod_clear boolean DEFAULT false,
    p_deletemethod varchar(10) DEFAULT NULL,
    p_iscustom BOOLEAN DEFAULT NULL,
    p_createapipath_clear boolean DEFAULT false,
    p_createapipath TEXT DEFAULT NULL,
    p_createmethod_clear boolean DEFAULT false,
    p_createmethod varchar(20) DEFAULT NULL,
    p_createbodyshape_clear boolean DEFAULT false,
    p_createbodyshape varchar(50) DEFAULT NULL,
    p_createbodykey_clear boolean DEFAULT false,
    p_createbodykey varchar(100) DEFAULT NULL,
    p_createidlocation_clear boolean DEFAULT false,
    p_createidlocation varchar(20) DEFAULT NULL,
    p_updateapipath_clear boolean DEFAULT false,
    p_updateapipath TEXT DEFAULT NULL,
    p_updatemethod_clear boolean DEFAULT false,
    p_updatemethod varchar(20) DEFAULT NULL,
    p_updatebodyshape_clear boolean DEFAULT false,
    p_updatebodyshape varchar(50) DEFAULT NULL,
    p_updatebodykey_clear boolean DEFAULT false,
    p_updatebodykey varchar(100) DEFAULT NULL,
    p_updateidlocation_clear boolean DEFAULT false,
    p_updateidlocation varchar(20) DEFAULT NULL,
    p_deleteapipath_clear boolean DEFAULT false,
    p_deleteapipath TEXT DEFAULT NULL,
    p_deleteidlocation_clear boolean DEFAULT false,
    p_deleteidlocation varchar(20) DEFAULT NULL,
    p_incrementalwatermarkfield_clear boolean DEFAULT false,
    p_incrementalwatermarkfield varchar(255) DEFAULT NULL,
    p_metadatasource varchar(20) DEFAULT NULL,
    p_supportscreate BOOLEAN DEFAULT NULL,
    p_supportsupdate BOOLEAN DEFAULT NULL,
    p_supportsdelete BOOLEAN DEFAULT NULL,
    p_syncstrategy_clear boolean DEFAULT false,
    p_syncstrategy varchar(50) DEFAULT NULL,
    p_contenthashapplicable BOOLEAN DEFAULT NULL,
    p_stableorderingkey_clear boolean DEFAULT false,
    p_stableorderingkey varchar(255) DEFAULT NULL,
    p_companyintegrationid UUID DEFAULT NULL,
    p_integrationobjectid_clear boolean DEFAULT false,
    p_integrationobjectid UUID DEFAULT NULL,
    p_provenance varchar(20) DEFAULT NULL,
    p_provenancedetail_clear boolean DEFAULT false,
    p_provenancedetail TEXT DEFAULT NULL,
    p_isselected BOOLEAN DEFAULT NULL,
    p_selectedat_clear boolean DEFAULT false,
    p_selectedat TIMESTAMPTZ DEFAULT NULL,
    p_firstseenat_clear boolean DEFAULT false,
    p_firstseenat TIMESTAMPTZ DEFAULT NULL,
    p_lastseenat_clear boolean DEFAULT false,
    p_lastseenat TIMESTAMPTZ DEFAULT NULL,
    p_lastsampledat_clear boolean DEFAULT false,
    p_lastsampledat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationObjects" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CompanyIntegrationObject"
    SET
        "IntegrationID" = COALESCE(p_integrationid, "IntegrationID"),
        "Name" = COALESCE(p_name, "Name"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Category" = CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, "Category") END,
        "APIPath" = COALESCE(p_apipath, "APIPath"),
        "ResponseDataKey" = CASE WHEN p_responsedatakey_clear = true THEN NULL ELSE COALESCE(p_responsedatakey, "ResponseDataKey") END,
        "DefaultPageSize" = COALESCE(p_defaultpagesize, "DefaultPageSize"),
        "SupportsPagination" = COALESCE(p_supportspagination, "SupportsPagination"),
        "PaginationType" = COALESCE(p_paginationtype, "PaginationType"),
        "SupportsIncrementalSync" = COALESCE(p_supportsincrementalsync, "SupportsIncrementalSync"),
        "SupportsWrite" = COALESCE(p_supportswrite, "SupportsWrite"),
        "DefaultQueryParams" = CASE WHEN p_defaultqueryparams_clear = true THEN NULL ELSE COALESCE(p_defaultqueryparams, "DefaultQueryParams") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Status" = COALESCE(p_status, "Status"),
        "WriteAPIPath" = CASE WHEN p_writeapipath_clear = true THEN NULL ELSE COALESCE(p_writeapipath, "WriteAPIPath") END,
        "WriteMethod" = CASE WHEN p_writemethod_clear = true THEN NULL ELSE COALESCE(p_writemethod, "WriteMethod") END,
        "DeleteMethod" = CASE WHEN p_deletemethod_clear = true THEN NULL ELSE COALESCE(p_deletemethod, "DeleteMethod") END,
        "IsCustom" = COALESCE(p_iscustom, "IsCustom"),
        "CreateAPIPath" = CASE WHEN p_createapipath_clear = true THEN NULL ELSE COALESCE(p_createapipath, "CreateAPIPath") END,
        "CreateMethod" = CASE WHEN p_createmethod_clear = true THEN NULL ELSE COALESCE(p_createmethod, "CreateMethod") END,
        "CreateBodyShape" = CASE WHEN p_createbodyshape_clear = true THEN NULL ELSE COALESCE(p_createbodyshape, "CreateBodyShape") END,
        "CreateBodyKey" = CASE WHEN p_createbodykey_clear = true THEN NULL ELSE COALESCE(p_createbodykey, "CreateBodyKey") END,
        "CreateIDLocation" = CASE WHEN p_createidlocation_clear = true THEN NULL ELSE COALESCE(p_createidlocation, "CreateIDLocation") END,
        "UpdateAPIPath" = CASE WHEN p_updateapipath_clear = true THEN NULL ELSE COALESCE(p_updateapipath, "UpdateAPIPath") END,
        "UpdateMethod" = CASE WHEN p_updatemethod_clear = true THEN NULL ELSE COALESCE(p_updatemethod, "UpdateMethod") END,
        "UpdateBodyShape" = CASE WHEN p_updatebodyshape_clear = true THEN NULL ELSE COALESCE(p_updatebodyshape, "UpdateBodyShape") END,
        "UpdateBodyKey" = CASE WHEN p_updatebodykey_clear = true THEN NULL ELSE COALESCE(p_updatebodykey, "UpdateBodyKey") END,
        "UpdateIDLocation" = CASE WHEN p_updateidlocation_clear = true THEN NULL ELSE COALESCE(p_updateidlocation, "UpdateIDLocation") END,
        "DeleteAPIPath" = CASE WHEN p_deleteapipath_clear = true THEN NULL ELSE COALESCE(p_deleteapipath, "DeleteAPIPath") END,
        "DeleteIDLocation" = CASE WHEN p_deleteidlocation_clear = true THEN NULL ELSE COALESCE(p_deleteidlocation, "DeleteIDLocation") END,
        "IncrementalWatermarkField" = CASE WHEN p_incrementalwatermarkfield_clear = true THEN NULL ELSE COALESCE(p_incrementalwatermarkfield, "IncrementalWatermarkField") END,
        "MetadataSource" = COALESCE(p_metadatasource, "MetadataSource"),
        "SupportsCreate" = COALESCE(p_supportscreate, "SupportsCreate"),
        "SupportsUpdate" = COALESCE(p_supportsupdate, "SupportsUpdate"),
        "SupportsDelete" = COALESCE(p_supportsdelete, "SupportsDelete"),
        "SyncStrategy" = CASE WHEN p_syncstrategy_clear = true THEN NULL ELSE COALESCE(p_syncstrategy, "SyncStrategy") END,
        "ContentHashApplicable" = COALESCE(p_contenthashapplicable, "ContentHashApplicable"),
        "StableOrderingKey" = CASE WHEN p_stableorderingkey_clear = true THEN NULL ELSE COALESCE(p_stableorderingkey, "StableOrderingKey") END,
        "CompanyIntegrationID" = COALESCE(p_companyintegrationid, "CompanyIntegrationID"),
        "IntegrationObjectID" = CASE WHEN p_integrationobjectid_clear = true THEN NULL ELSE COALESCE(p_integrationobjectid, "IntegrationObjectID") END,
        "Provenance" = COALESCE(p_provenance, "Provenance"),
        "ProvenanceDetail" = CASE WHEN p_provenancedetail_clear = true THEN NULL ELSE COALESCE(p_provenancedetail, "ProvenanceDetail") END,
        "IsSelected" = COALESCE(p_isselected, "IsSelected"),
        "SelectedAt" = CASE WHEN p_selectedat_clear = true THEN NULL ELSE COALESCE(p_selectedat, "SelectedAt") END,
        "FirstSeenAt" = CASE WHEN p_firstseenat_clear = true THEN NULL ELSE COALESCE(p_firstseenat, "FirstSeenAt") END,
        "LastSeenAt" = CASE WHEN p_lastseenat_clear = true THEN NULL ELSE COALESCE(p_lastseenat, "LastSeenAt") END,
        "LastSampledAt" = CASE WHEN p_lastsampledat_clear = true THEN NULL ELSE COALESCE(p_lastsampledat, "LastSampledAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationObjects"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationObject" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationObject" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationObject table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_company_integration_object"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_company_integration_object" ON "__mj"."CompanyIntegrationObject";

CREATE TRIGGER "trg_update_company_integration_object"
BEFORE UPDATE ON "__mj"."CompanyIntegrationObject"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_company_integration_object"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Objects
-- Item: spDeleteCompanyIntegrationObject
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CompanyIntegrationObject
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCompanyIntegrationObject'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCompanyIntegrationObject"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CompanyIntegrationObject"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationObject" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationObject" TO "cdp_Integration";
