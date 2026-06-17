/* ============================================================================
   External Data Sources — Phase 1 Schema (Metadata Foundation)
   v5.40.x

   Companion plan: /plans/external-data-sources.md (design)

   Introduces the "External Data Sources" primitive: live, runtime-proxied
   access to remote data systems (Snowflake, Oracle, MongoDB, external
   SQL Server / PostgreSQL / MySQL). Distinct from VirtualEntity (same MJ DB,
   view-backed) and from Integrations (scheduled pull-sync). Mirrors the
   Credential Types / Credentials Type/Instance split and plugs into the
   Credential Engine for secrets.

   Tables (all new; no destructive changes):
     ExternalDataSourceType  — driver-type catalog (@RegisterClass driver key
                               + capability flags). References a Credential Type
                               to constrain valid credential shapes.
     ExternalDataSource      — configured instances (-> Credential for auth,
                               -> ExternalDataSourceType for driver).

   Existing tables altered (additive, nullable only):
     Entity  + ExternalDataSourceID (FK), ExternalObjectName
     Query   + ExternalDataSourceID (FK)

   Behavior is fully additive: every entity/query with ExternalDataSourceID
   NULL (the default — i.e. all existing rows) is unchanged.

   CodeGen convention (per CLAUDE.md migrations guide):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
     * sp_addextendedproperty for every non-PK / non-FK column so CodeGen
       surfaces descriptions on regen.
     * Driver-type catalog rows are seeded via metadata files
       (metadata/external-data-source-types/), NOT SQL INSERTs.

   Entity metadata, views, and spCreate/Update/Delete are produced by CodeGen
   after this migration runs.
   ============================================================================ */


-- ============================================================================
-- 1. ExternalDataSourceType  ("MJ: External Data Source Types") — driver catalog
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.ExternalDataSourceType (
    ID                            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                          NVARCHAR(100)    NOT NULL,
    Description                   NVARCHAR(MAX)    NULL,
    DriverClass                   NVARCHAR(255)    NOT NULL,
    RequiredCredentialTypeID      UNIQUEIDENTIFIER NULL,
    MetadataIntrospectionStrategy NVARCHAR(50)     NOT NULL CONSTRAINT DF_ExternalDataSourceType_MetadataIntrospectionStrategy DEFAULT (N'Manual'),
    FilterDialect                 NVARCHAR(50)     NOT NULL CONSTRAINT DF_ExternalDataSourceType_FilterDialect DEFAULT (N'ansi'),
    PagingStrategy                NVARCHAR(50)     NOT NULL CONSTRAINT DF_ExternalDataSourceType_PagingStrategy DEFAULT (N'LimitOffset'),
    SupportsSchemaIntrospection   BIT              NOT NULL CONSTRAINT DF_ExternalDataSourceType_SupportsSchemaIntrospection DEFAULT (1),
    SupportsNativeQueries         BIT              NOT NULL CONSTRAINT DF_ExternalDataSourceType_SupportsNativeQueries DEFAULT (1),
    SupportsReadWrite             BIT              NOT NULL CONSTRAINT DF_ExternalDataSourceType_SupportsReadWrite DEFAULT (0),
    Status                        NVARCHAR(20)     NOT NULL CONSTRAINT DF_ExternalDataSourceType_Status DEFAULT (N'Active'),
    CONSTRAINT PK_ExternalDataSourceType PRIMARY KEY (ID),
    CONSTRAINT UQ_ExternalDataSourceType_Name UNIQUE (Name),
    CONSTRAINT FK_ExternalDataSourceType_CredentialType FOREIGN KEY (RequiredCredentialTypeID)
        REFERENCES ${flyway:defaultSchema}.CredentialType (ID),
    CONSTRAINT CK_ExternalDataSourceType_MetadataIntrospectionStrategy
        CHECK (MetadataIntrospectionStrategy IN (N'InformationSchema', N'NativeCatalog', N'SampledDocuments', N'Manual')),
    CONSTRAINT CK_ExternalDataSourceType_FilterDialect
        CHECK (FilterDialect IN (N'tsql', N'ansi', N'pgsql', N'mysql', N'oracle', N'mongo-ast')),
    CONSTRAINT CK_ExternalDataSourceType_PagingStrategy
        CHECK (PagingStrategy IN (N'OffsetFetch', N'LimitOffset', N'TopSkip', N'Cursor')),
    CONSTRAINT CK_ExternalDataSourceType_Status
        CHECK (Status IN (N'Active', N'Deprecated'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the external data source driver type (e.g. Snowflake, Oracle, MongoDB, PostgreSQL).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable description of the driver type and what remote systems it targets.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Driver class resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseExternalDataSourceDriver, DriverClass). MUST match the @RegisterClass key on the concrete driver (e.g. ''SnowflakeExternalDriver'').',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How the metadata-introspection command hydrates Entity/EntityField rows from this driver family: InformationSchema (ANSI INFORMATION_SCHEMA), NativeCatalog (vendor catalog views), SampledDocuments (infer shape from sampled documents, e.g. MongoDB), or Manual (no automated introspection).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'MetadataIntrospectionStrategy';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Dialect the driver expects for RunView filter pass-through: tsql, ansi, pgsql, mysql, oracle, or mongo-ast (MongoDB filter AST translated within the driver).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'FilterDialect';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Pagination mechanism the driver uses: OffsetFetch (SQL Server OFFSET/FETCH), LimitOffset (Postgres/MySQL LIMIT/OFFSET), TopSkip, or Cursor.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'PagingStrategy';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the driver can introspect remote schema metadata to assist Entity/EntityField generation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'SupportsSchemaIntrospection';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the driver supports native-dialect query execution for MJ Queries that set ExternalDataSourceID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'SupportsNativeQueries';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reserved for a future write-capable phase. Always 0 in the current read-only design; external entities are read-only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'SupportsReadWrite';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status of the driver-type catalog entry: Active or Deprecated.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSourceType',
    @level2type = N'COLUMN', @level2name = N'Status';


-- ============================================================================
-- 2. ExternalDataSource  ("MJ: External Data Sources") — configured instances
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.ExternalDataSource (
    ID                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                     NVARCHAR(100)    NOT NULL,
    Description              NVARCHAR(MAX)    NULL,
    TypeID                   UNIQUEIDENTIFIER NOT NULL,
    CredentialID             UNIQUEIDENTIFIER NULL,
    DefaultSchema            NVARCHAR(255)    NULL,
    DefaultDatabase          NVARCHAR(255)    NULL,
    ConnectionConfig         NVARCHAR(MAX)    NULL,
    DefaultCacheTTLSeconds   INT              NOT NULL CONSTRAINT DF_ExternalDataSource_DefaultCacheTTLSeconds DEFAULT (300),
    Status                   NVARCHAR(20)     NOT NULL CONSTRAINT DF_ExternalDataSource_Status DEFAULT (N'Active'),
    LastConnectionTestAt     DATETIMEOFFSET   NULL,
    LastConnectionTestResult NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_ExternalDataSource PRIMARY KEY (ID),
    CONSTRAINT UQ_ExternalDataSource_Name UNIQUE (Name),
    CONSTRAINT FK_ExternalDataSource_ExternalDataSourceType FOREIGN KEY (TypeID)
        REFERENCES ${flyway:defaultSchema}.ExternalDataSourceType (ID),
    CONSTRAINT FK_ExternalDataSource_Credential FOREIGN KEY (CredentialID)
        REFERENCES ${flyway:defaultSchema}.Credential (ID),
    CONSTRAINT CK_ExternalDataSource_Status
        CHECK (Status IN (N'Active', N'Disabled', N'TestFailed'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of this configured external data source instance.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSource',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable description of what this data source connects to and what it is used for.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSource',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default schema/namespace to resolve unqualified ExternalObjectName values against on the remote system (e.g. a SQL schema, Snowflake schema).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSource',
    @level2type = N'COLUMN', @level2name = N'DefaultSchema';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default database/catalog on the remote system (e.g. Snowflake database, MongoDB dbName). Nullable when the driver derives it from connection config.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSource',
    @level2type = N'COLUMN', @level2name = N'DefaultDatabase';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON blob of NON-SECRET driver configuration (host, port, region, warehouse, replica-set name, pool sizing). All secrets flow through CredentialID -> Credential -> CredentialEngine; never store secrets here.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSource',
    @level2type = N'COLUMN', @level2name = N'ConnectionConfig';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default server-side cache TTL (seconds) for reads against this source. External reads use time-based TTL because no event-driven invalidation is possible on remote systems. Default 300.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSource',
    @level2type = N'COLUMN', @level2name = N'DefaultCacheTTLSeconds';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Operational status of this data source: Active (usable), Disabled (RunView fails fast), or TestFailed (last connection test failed).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSource',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the most recent connection test against this source.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSource',
    @level2type = N'COLUMN', @level2name = N'LastConnectionTestAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Result message from the most recent connection test (success detail or error text).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ExternalDataSource',
    @level2type = N'COLUMN', @level2name = N'LastConnectionTestResult';


-- ============================================================================
-- 3. Entity  — add nullable external-source columns (additive)
--    ExternalDataSourceID NULL  => entity is backed by the MJ DB (unchanged).
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.Entity ADD
    ExternalDataSourceID UNIQUEIDENTIFIER NULL,
    ExternalObjectName   NVARCHAR(255)    NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.Entity ADD CONSTRAINT FK_Entity_ExternalDataSource
    FOREIGN KEY (ExternalDataSourceID) REFERENCES ${flyway:defaultSchema}.ExternalDataSource (ID);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Remote object name (table / view / collection) on the external system that backs this entity. Resolved against the data source DefaultSchema/DefaultDatabase when unqualified. Only meaningful when ExternalDataSourceID is set.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'ExternalObjectName';


-- ============================================================================
-- 4. Query  — add nullable external-source column (additive)
--    ExternalDataSourceID NULL  => query runs against the MJ DB (unchanged).
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.Query ADD
    ExternalDataSourceID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.Query ADD CONSTRAINT FK_Query_ExternalDataSource
    FOREIGN KEY (ExternalDataSourceID) REFERENCES ${flyway:defaultSchema}.ExternalDataSource (ID);
GO
