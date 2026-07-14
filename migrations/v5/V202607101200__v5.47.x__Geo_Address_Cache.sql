-- =============================================================================
-- Geo Address Cache — persistent, address-level geocode cache
-- =============================================================================
-- RecordGeoCode is keyed per-record (EntityID, RecordID, LocationType), so two
-- records sharing the same physical address each trigger their own external
-- geocoding API call. This table adds a shared address→coordinates cache keyed
-- by a SHA-256 hash of the normalized address string, so any record (in any
-- entity) whose address was previously geocoded reuses the stored result
-- instead of calling the provider again.
--
-- Written to by GeoCodeSyncService (packages/geo/geo-core) after each external
-- provider call, gated on the provider's AllowsPersistentStorage ToS flag.
-- Read before every external provider call. Negative results (addresses the
-- provider cannot resolve, e.g. "Conference Room B") are cached with
-- Status='not_geocodable' and an ExpiresAt TTL so they are periodically
-- re-attempted rather than retried on every run.
--
-- See plans/geocoding-efficiency-and-address-dedup.md for the full design.
-- =============================================================================

CREATE TABLE ${flyway:defaultSchema}.GeoAddressCache (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AddressHash NVARCHAR(64) NOT NULL,
    NormalizedAddress NVARCHAR(1000) NOT NULL,
    Latitude DECIMAL(10,6) NULL,
    Longitude DECIMAL(10,6) NULL,
    Precision NVARCHAR(20) NULL,
    Confidence DECIMAL(5,4) NULL,
    FormattedAddress NVARCHAR(500) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'success',
    GeocodingSource NVARCHAR(30) NULL,
    GeocodedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    ExpiresAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_GeoAddressCache PRIMARY KEY (ID),
    CONSTRAINT UQ_GeoAddressCache_AddressHash UNIQUE (AddressHash),
    CONSTRAINT CK_GeoAddressCache_Precision
        CHECK (Precision IN ('exact', 'postal_code', 'city', 'county', 'state_province', 'country')),
    CONSTRAINT CK_GeoAddressCache_Status
        CHECK (Status IN ('success', 'not_geocodable'))
);

-- =============================================================================
-- Extended properties (descriptions consumed by CodeGen)
-- =============================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Shared, address-level geocoding cache. Keyed by a SHA-256 hash of the normalized address string so that identical addresses across any records/entities reuse one external geocoding API result instead of each making their own call. Includes negative caching (Status=not_geocodable with ExpiresAt TTL). Writes are gated on the geocoding provider''s AllowsPersistentStorage terms-of-service flag.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'SHA-256 hex digest of the normalized address string (lowercased, trimmed, whitespace-collapsed). Unique — this is the cache key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'AddressHash';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The normalized address string that produced AddressHash, stored for debuggability and audit. Not used for lookups.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'NormalizedAddress';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Latitude returned by the geocoding provider. NULL for not_geocodable entries.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'Latitude';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Longitude returned by the geocoding provider. NULL for not_geocodable entries.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'Longitude';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Precision level of the cached geocode (exact, postal_code, city, county, state_province, country). NULL for not_geocodable entries.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'Precision';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider-reported confidence score normalized to 0.0000–1.0000. NULL when the provider does not surface one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'Confidence';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Formatted/canonical address string returned by the provider, stored for debuggability. NULL when not provided.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'FormattedAddress';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cache entry status: success (usable coordinates) or not_geocodable (the provider could not resolve this address — negative cache entry, re-attempted after ExpiresAt).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the geocoding provider that produced this entry (google, geocodio, here, or a custom registered provider).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'GeocodingSource';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the provider call that produced this entry was made.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'GeocodedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional expiry for this entry. Used for negative (not_geocodable) entries so unresolvable addresses are periodically re-attempted; NULL means the entry does not expire.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GeoAddressCache',
    @level2type = N'COLUMN', @level2name = N'ExpiresAt';


















































-- =============================================================================
-- =============================================================================
-- ==  EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION        ==
-- ==  CODEGEN TOOL (mj codegen) — DO NOT EDIT BY HAND.                       ==
-- ==                                                                         ==
-- ==  Contains: Entity/EntityField metadata inserts for the GeoAddressCache ==
-- ==  table, EntityFieldValue rows derived from its CHECK constraints, the   ==
-- ==  regenerated vwGeoAddressCaches view, spCreate/spUpdate/spDelete        ==
-- ==  procs, permission grants, FK-support indexes, and extended-property    ==
-- ==  registrations.                                                         ==
-- ==                                                                         ==
-- ==  If the hand-written DDL above changes, re-run CodeGen and replace      ==
-- ==  this ENTIRE generated section with the new CodeGen_Run output.         ==
-- =============================================================================
-- =============================================================================

/* SQL generated to create new entity MJ: Geo Address Caches */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'e08f1079-25f7-4451-997a-7d18b1515acd',
         'MJ: Geo Address Caches',
         'Geo Address Caches',
         'Shared, address-level geocoding cache. Keyed by a SHA-256 hash of the normalized address string so that identical addresses across any records/entities reuse one external geocoding API result instead of each making their own call. Includes negative caching (Status=not_geocodable with ExpiresAt TTL). Writes are gated on the geocoding provider''s AllowsPersistentStorage terms-of-service flag.',
         NULL,
         'GeoAddressCache',
         'vwGeoAddressCaches',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Geo Address Caches to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e08f1079-25f7-4451-997a-7d18b1515acd', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Geo Address Caches for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e08f1079-25f7-4451-997a-7d18b1515acd', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Geo Address Caches for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e08f1079-25f7-4451-997a-7d18b1515acd', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Geo Address Caches for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e08f1079-25f7-4451-997a-7d18b1515acd', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GeoAddressCache */
ALTER TABLE [${flyway:defaultSchema}].[GeoAddressCache] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GeoAddressCache */
UPDATE [${flyway:defaultSchema}].[GeoAddressCache] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GeoAddressCache */
ALTER TABLE [${flyway:defaultSchema}].[GeoAddressCache] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GeoAddressCache */
ALTER TABLE [${flyway:defaultSchema}].[GeoAddressCache] ADD CONSTRAINT [DF___mj_GeoAddressCache___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GeoAddressCache */
ALTER TABLE [${flyway:defaultSchema}].[GeoAddressCache] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GeoAddressCache */
UPDATE [${flyway:defaultSchema}].[GeoAddressCache] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GeoAddressCache */
ALTER TABLE [${flyway:defaultSchema}].[GeoAddressCache] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GeoAddressCache */
ALTER TABLE [${flyway:defaultSchema}].[GeoAddressCache] ADD CONSTRAINT [DF___mj_GeoAddressCache___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0428321f-a711-4964-95f2-9e218c02135e' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'ID')) BEGIN
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
            '0428321f-a711-4964-95f2-9e218c02135e',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06513930-22a1-43c7-a8d9-7e904200f2fc' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'AddressHash')) BEGIN
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
            '06513930-22a1-43c7-a8d9-7e904200f2fc',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100002,
            'AddressHash',
            'Address Hash',
            'SHA-256 hex digest of the normalized address string (lowercased, trimmed, whitespace-collapsed). Unique — this is the cache key.',
            'nvarchar',
            128,
            0,
            0,
            0,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a8325d4-3b0f-4a21-987d-764e32b167e8' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'NormalizedAddress')) BEGIN
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
            '0a8325d4-3b0f-4a21-987d-764e32b167e8',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100003,
            'NormalizedAddress',
            'Normalized Address',
            'The normalized address string that produced AddressHash, stored for debuggability and audit. Not used for lookups.',
            'nvarchar',
            2000,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b65fa1ab-54e3-4260-9ff8-d784eb627e72' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'Latitude')) BEGIN
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
            'b65fa1ab-54e3-4260-9ff8-d784eb627e72',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100004,
            'Latitude',
            'Latitude',
            'Latitude returned by the geocoding provider. NULL for not_geocodable entries.',
            'decimal',
            9,
            10,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93326096-ab8e-49eb-852f-3b0516615800' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'Longitude')) BEGIN
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
            '93326096-ab8e-49eb-852f-3b0516615800',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100005,
            'Longitude',
            'Longitude',
            'Longitude returned by the geocoding provider. NULL for not_geocodable entries.',
            'decimal',
            9,
            10,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '218aaf5b-8cfe-4167-b2f9-4d0bfc49f1ee' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'Precision')) BEGIN
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
            '218aaf5b-8cfe-4167-b2f9-4d0bfc49f1ee',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100006,
            'Precision',
            'Precision',
            'Precision level of the cached geocode (exact, postal_code, city, county, state_province, country). NULL for not_geocodable entries.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '99d2841f-723f-4ffd-ac3f-e0c8586adf92' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'Confidence')) BEGIN
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
            '99d2841f-723f-4ffd-ac3f-e0c8586adf92',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100007,
            'Confidence',
            'Confidence',
            'Provider-reported confidence score normalized to 0.0000–1.0000. NULL when the provider does not surface one.',
            'decimal',
            5,
            5,
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f89f0d26-5ae8-4380-b2a6-2718beebbfa7' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'FormattedAddress')) BEGIN
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
            'f89f0d26-5ae8-4380-b2a6-2718beebbfa7',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100008,
            'FormattedAddress',
            'Formatted Address',
            'Formatted/canonical address string returned by the provider, stored for debuggability. NULL when not provided.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69beac36-c5e8-4918-9bcc-a7ee52807c3a' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'Status')) BEGIN
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
            '69beac36-c5e8-4918-9bcc-a7ee52807c3a',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100009,
            'Status',
            'Status',
            'Cache entry status: success (usable coordinates) or not_geocodable (the provider could not resolve this address — negative cache entry, re-attempted after ExpiresAt).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'success',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4a33ca3-980f-4e7d-98b9-8f18cf047108' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'GeocodingSource')) BEGIN
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
            'd4a33ca3-980f-4e7d-98b9-8f18cf047108',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100010,
            'GeocodingSource',
            'Geocoding Source',
            'Name of the geocoding provider that produced this entry (google, geocodio, here, or a custom registered provider).',
            'nvarchar',
            60,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba3f1e42-e6e7-4496-8d35-3eabb003cac9' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'GeocodedAt')) BEGIN
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
            'ba3f1e42-e6e7-4496-8d35-3eabb003cac9',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100011,
            'GeocodedAt',
            'Geocoded At',
            'When the provider call that produced this entry was made.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '398ab28f-5f92-46cc-854e-e8763ce33f4b' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = 'ExpiresAt')) BEGIN
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
            '398ab28f-5f92-46cc-854e-e8763ce33f4b',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100012,
            'ExpiresAt',
            'Expires At',
            'Optional expiry for this entry. Used for negative (not_geocodable) entries so unresolvable addresses are periodically re-attempted; NULL means the entry does not expire.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df70a86d-271e-4339-989b-2f3635dfaa4c' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = '__mj_CreatedAt')) BEGIN
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
            'df70a86d-271e-4339-989b-2f3635dfaa4c',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100013,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5ee3020-0f69-4f98-bfe3-c91a8a0fff81' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'f5ee3020-0f69-4f98-bfe3-c91a8a0fff81',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100014,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

/* SQL text to insert entity field value with ID 300d4484-c7a7-4a22-a217-a318119c3a1d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('300d4484-c7a7-4a22-a217-a318119c3a1d', '218AAF5B-8CFE-4167-B2F9-4D0BFC49F1EE', 1, 'city', 'city', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1142b2c8-944d-48b6-a4ea-6986c057a87a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1142b2c8-944d-48b6-a4ea-6986c057a87a', '218AAF5B-8CFE-4167-B2F9-4D0BFC49F1EE', 2, 'country', 'country', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f7433541-651f-4794-a820-d5cb2169b6d7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f7433541-651f-4794-a820-d5cb2169b6d7', '218AAF5B-8CFE-4167-B2F9-4D0BFC49F1EE', 3, 'county', 'county', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6001b5c7-e240-4caf-821d-0e532f7c8cf1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6001b5c7-e240-4caf-821d-0e532f7c8cf1', '218AAF5B-8CFE-4167-B2F9-4D0BFC49F1EE', 4, 'exact', 'exact', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 26a63f1b-3d74-4df6-95dc-fc4f725bbd6e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('26a63f1b-3d74-4df6-95dc-fc4f725bbd6e', '218AAF5B-8CFE-4167-B2F9-4D0BFC49F1EE', 5, 'postal_code', 'postal_code', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d6b0de83-f5fd-4128-a8a0-670a0becf60e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d6b0de83-f5fd-4128-a8a0-670a0becf60e', '218AAF5B-8CFE-4167-B2F9-4D0BFC49F1EE', 6, 'state_province', 'state_province', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 218AAF5B-8CFE-4167-B2F9-4D0BFC49F1EE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='218AAF5B-8CFE-4167-B2F9-4D0BFC49F1EE';

/* SQL text to insert entity field value with ID 58ede42a-c10e-4c6b-9732-a69864717bc2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58ede42a-c10e-4c6b-9732-a69864717bc2', '69BEAC36-C5E8-4918-9BCC-A7EE52807C3A', 1, 'not_geocodable', 'not_geocodable', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1da6388f-70b0-4074-8b60-42be22940161 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1da6388f-70b0-4074-8b60-42be22940161', '69BEAC36-C5E8-4918-9BCC-A7EE52807C3A', 2, 'success', 'success', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 69BEAC36-C5E8-4918-9BCC-A7EE52807C3A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='69BEAC36-C5E8-4918-9BCC-A7EE52807C3A';

/* Index for Foreign Keys for GeoAddressCache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: vwGeoAddressCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Geo Address Caches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GeoAddressCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGeoAddressCaches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGeoAddressCaches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGeoAddressCaches]
AS
SELECT
    g.*
FROM
    [${flyway:defaultSchema}].[GeoAddressCache] AS g
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGeoAddressCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: Permissions for vwGeoAddressCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGeoAddressCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: spCreateGeoAddressCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GeoAddressCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGeoAddressCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGeoAddressCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGeoAddressCache]
    @ID uniqueidentifier = NULL,
    @AddressHash nvarchar(64),
    @NormalizedAddress nvarchar(1000),
    @Latitude_Clear bit = 0,
    @Latitude decimal(10, 6) = NULL,
    @Longitude_Clear bit = 0,
    @Longitude decimal(10, 6) = NULL,
    @Precision_Clear bit = 0,
    @Precision nvarchar(20) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL,
    @FormattedAddress_Clear bit = 0,
    @FormattedAddress nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @GeocodingSource_Clear bit = 0,
    @GeocodingSource nvarchar(30) = NULL,
    @GeocodedAt datetimeoffset = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GeoAddressCache]
            (
                [ID],
                [AddressHash],
                [NormalizedAddress],
                [Latitude],
                [Longitude],
                [Precision],
                [Confidence],
                [FormattedAddress],
                [Status],
                [GeocodingSource],
                [GeocodedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AddressHash,
                @NormalizedAddress,
                CASE WHEN @Latitude_Clear = 1 THEN NULL ELSE ISNULL(@Latitude, NULL) END,
                CASE WHEN @Longitude_Clear = 1 THEN NULL ELSE ISNULL(@Longitude, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @FormattedAddress_Clear = 1 THEN NULL ELSE ISNULL(@FormattedAddress, NULL) END,
                ISNULL(@Status, 'success'),
                CASE WHEN @GeocodingSource_Clear = 1 THEN NULL ELSE ISNULL(@GeocodingSource, NULL) END,
                ISNULL(@GeocodedAt, sysdatetimeoffset()),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GeoAddressCache]
            (
                [AddressHash],
                [NormalizedAddress],
                [Latitude],
                [Longitude],
                [Precision],
                [Confidence],
                [FormattedAddress],
                [Status],
                [GeocodingSource],
                [GeocodedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AddressHash,
                @NormalizedAddress,
                CASE WHEN @Latitude_Clear = 1 THEN NULL ELSE ISNULL(@Latitude, NULL) END,
                CASE WHEN @Longitude_Clear = 1 THEN NULL ELSE ISNULL(@Longitude, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @FormattedAddress_Clear = 1 THEN NULL ELSE ISNULL(@FormattedAddress, NULL) END,
                ISNULL(@Status, 'success'),
                CASE WHEN @GeocodingSource_Clear = 1 THEN NULL ELSE ISNULL(@GeocodingSource, NULL) END,
                ISNULL(@GeocodedAt, sysdatetimeoffset()),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGeoAddressCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Geo Address Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: spUpdateGeoAddressCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GeoAddressCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGeoAddressCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGeoAddressCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGeoAddressCache]
    @ID uniqueidentifier,
    @AddressHash nvarchar(64) = NULL,
    @NormalizedAddress nvarchar(1000) = NULL,
    @Latitude_Clear bit = 0,
    @Latitude decimal(10, 6) = NULL,
    @Longitude_Clear bit = 0,
    @Longitude decimal(10, 6) = NULL,
    @Precision_Clear bit = 0,
    @Precision nvarchar(20) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL,
    @FormattedAddress_Clear bit = 0,
    @FormattedAddress nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @GeocodingSource_Clear bit = 0,
    @GeocodingSource nvarchar(30) = NULL,
    @GeocodedAt datetimeoffset = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeoAddressCache]
    SET
        [AddressHash] = ISNULL(@AddressHash, [AddressHash]),
        [NormalizedAddress] = ISNULL(@NormalizedAddress, [NormalizedAddress]),
        [Latitude] = CASE WHEN @Latitude_Clear = 1 THEN NULL ELSE ISNULL(@Latitude, [Latitude]) END,
        [Longitude] = CASE WHEN @Longitude_Clear = 1 THEN NULL ELSE ISNULL(@Longitude, [Longitude]) END,
        [Precision] = CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, [Precision]) END,
        [Confidence] = CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, [Confidence]) END,
        [FormattedAddress] = CASE WHEN @FormattedAddress_Clear = 1 THEN NULL ELSE ISNULL(@FormattedAddress, [FormattedAddress]) END,
        [Status] = ISNULL(@Status, [Status]),
        [GeocodingSource] = CASE WHEN @GeocodingSource_Clear = 1 THEN NULL ELSE ISNULL(@GeocodingSource, [GeocodingSource]) END,
        [GeocodedAt] = ISNULL(@GeocodedAt, [GeocodedAt]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGeoAddressCaches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGeoAddressCaches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeoAddressCache] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GeoAddressCache table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGeoAddressCache]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGeoAddressCache];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGeoAddressCache
ON [${flyway:defaultSchema}].[GeoAddressCache]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeoAddressCache]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GeoAddressCache] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Geo Address Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: spDeleteGeoAddressCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeoAddressCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGeoAddressCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGeoAddressCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGeoAddressCache]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GeoAddressCache]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Geo Address Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '0A8325D4-3B0F-4A21-987D-764E32B167E8'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0A8325D4-3B0F-4A21-987D-764E32B167E8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B65FA1AB-54E3-4260-9FF8-D784EB627E72'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '93326096-AB8E-49EB-852F-3B0516615800'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '69BEAC36-C5E8-4918-9BCC-A7EE52807C3A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D4A33CA3-980F-4E7D-98B9-8F18CF047108'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '398AB28F-5F92-46CC-854E-E8763CE33F4B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0A8325D4-3B0F-4A21-987D-764E32B167E8'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F89F0D26-5AE8-4380-B2A6-2718BEEBBFA7'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0428321F-A711-4964-95F2-9E218C02135E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.AddressHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Cache Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '06513930-22A1-43C7-A8D9-7E904200F2FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.NormalizedAddress 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Cache Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = '0A8325D4-3B0F-4A21-987D-764E32B167E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.FormattedAddress 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = 'F89F0D26-5AE8-4380-B2A6-2718BEEBBFA7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.Latitude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoLatitude',
   CodeType = NULL
WHERE 
   ID = 'B65FA1AB-54E3-4260-9FF8-D784EB627E72' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.Longitude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoLongitude',
   CodeType = NULL
WHERE 
   ID = '93326096-AB8E-49EB-852F-3B0516615800' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.Precision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '218AAF5B-8CFE-4167-B2F9-4D0BFC49F1EE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.Confidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '99D2841F-723F-4FFD-AC3F-E0C8586ADF92' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Cache Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '69BEAC36-C5E8-4918-9BCC-A7EE52807C3A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.GeocodingSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Cache Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D4A33CA3-980F-4E7D-98B9-8F18CF047108' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.GeocodedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Cache Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA3F1E42-E6E7-4496-8D35-3EABB003CAC9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.ExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Cache Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '398AB28F-5F92-46CC-854E-E8763CE33F4B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF70A86D-271E-4339-989B-2F3635DFAA4C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Geo Address Caches.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5EE3020-0F69-4F98-BFE3-C91A8A0FFF81' AND AutoUpdateCategory = 1;

/* Set SupportsGeoCoding = true for MJ: Geo Address Caches */

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET [SupportsGeoCoding] = 1
            WHERE [ID] = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND [AutoUpdateSupportsGeoCoding] = 1;

/* Set entity icon to fa fa-map-marked-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-map-marked-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'E08F1079-25F7-4451-997A-7D18B1515ACD';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7e0348f6-dfa0-415b-a533-ec8981df685f', 'E08F1079-25F7-4451-997A-7D18B1515ACD', 'FieldCategoryInfo', '{"Cache Identification":{"icon":"fa fa-fingerprint","description":"Unique identifiers and normalized strings used to key the address cache."},"Geocoding Results":{"icon":"fa fa-map-marker-alt","description":"Location data and metadata returned by the geocoding provider."},"Cache Lifecycle":{"icon":"fa fa-history","description":"Information regarding the status, source, and validity period of the cached entry."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9873d8dc-edb2-42c1-b876-99e4669764f4', 'E08F1079-25F7-4451-997A-7D18B1515ACD', 'FieldCategoryIcons', '{"Cache Identification":"fa fa-fingerprint","Geocoding Results":"fa fa-map-marker-alt","Cache Lifecycle":"fa fa-history","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'E08F1079-25F7-4451-997A-7D18B1515ACD';

/* Index for Foreign Keys for GeoAddressCache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: vwGeoAddressCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Geo Address Caches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GeoAddressCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGeoAddressCaches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGeoAddressCaches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGeoAddressCaches]
AS
SELECT
    g.*,    [g].[Latitude] AS [${flyway:defaultSchema}_Latitude],
    [g].[Longitude] AS [${flyway:defaultSchema}_Longitude]
FROM
    [${flyway:defaultSchema}].[GeoAddressCache] AS g
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGeoAddressCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: Permissions for vwGeoAddressCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGeoAddressCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: spCreateGeoAddressCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GeoAddressCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGeoAddressCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGeoAddressCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGeoAddressCache]
    @ID uniqueidentifier = NULL,
    @AddressHash nvarchar(64),
    @NormalizedAddress nvarchar(1000),
    @Latitude_Clear bit = 0,
    @Latitude decimal(10, 6) = NULL,
    @Longitude_Clear bit = 0,
    @Longitude decimal(10, 6) = NULL,
    @Precision_Clear bit = 0,
    @Precision nvarchar(20) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL,
    @FormattedAddress_Clear bit = 0,
    @FormattedAddress nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @GeocodingSource_Clear bit = 0,
    @GeocodingSource nvarchar(30) = NULL,
    @GeocodedAt datetimeoffset = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GeoAddressCache]
            (
                [ID],
                [AddressHash],
                [NormalizedAddress],
                [Latitude],
                [Longitude],
                [Precision],
                [Confidence],
                [FormattedAddress],
                [Status],
                [GeocodingSource],
                [GeocodedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AddressHash,
                @NormalizedAddress,
                CASE WHEN @Latitude_Clear = 1 THEN NULL ELSE ISNULL(@Latitude, NULL) END,
                CASE WHEN @Longitude_Clear = 1 THEN NULL ELSE ISNULL(@Longitude, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @FormattedAddress_Clear = 1 THEN NULL ELSE ISNULL(@FormattedAddress, NULL) END,
                ISNULL(@Status, 'success'),
                CASE WHEN @GeocodingSource_Clear = 1 THEN NULL ELSE ISNULL(@GeocodingSource, NULL) END,
                ISNULL(@GeocodedAt, sysdatetimeoffset()),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GeoAddressCache]
            (
                [AddressHash],
                [NormalizedAddress],
                [Latitude],
                [Longitude],
                [Precision],
                [Confidence],
                [FormattedAddress],
                [Status],
                [GeocodingSource],
                [GeocodedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AddressHash,
                @NormalizedAddress,
                CASE WHEN @Latitude_Clear = 1 THEN NULL ELSE ISNULL(@Latitude, NULL) END,
                CASE WHEN @Longitude_Clear = 1 THEN NULL ELSE ISNULL(@Longitude, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @FormattedAddress_Clear = 1 THEN NULL ELSE ISNULL(@FormattedAddress, NULL) END,
                ISNULL(@Status, 'success'),
                CASE WHEN @GeocodingSource_Clear = 1 THEN NULL ELSE ISNULL(@GeocodingSource, NULL) END,
                ISNULL(@GeocodedAt, sysdatetimeoffset()),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGeoAddressCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Geo Address Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: spUpdateGeoAddressCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GeoAddressCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGeoAddressCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGeoAddressCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGeoAddressCache]
    @ID uniqueidentifier,
    @AddressHash nvarchar(64) = NULL,
    @NormalizedAddress nvarchar(1000) = NULL,
    @Latitude_Clear bit = 0,
    @Latitude decimal(10, 6) = NULL,
    @Longitude_Clear bit = 0,
    @Longitude decimal(10, 6) = NULL,
    @Precision_Clear bit = 0,
    @Precision nvarchar(20) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL,
    @FormattedAddress_Clear bit = 0,
    @FormattedAddress nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @GeocodingSource_Clear bit = 0,
    @GeocodingSource nvarchar(30) = NULL,
    @GeocodedAt datetimeoffset = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeoAddressCache]
    SET
        [AddressHash] = ISNULL(@AddressHash, [AddressHash]),
        [NormalizedAddress] = ISNULL(@NormalizedAddress, [NormalizedAddress]),
        [Latitude] = CASE WHEN @Latitude_Clear = 1 THEN NULL ELSE ISNULL(@Latitude, [Latitude]) END,
        [Longitude] = CASE WHEN @Longitude_Clear = 1 THEN NULL ELSE ISNULL(@Longitude, [Longitude]) END,
        [Precision] = CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, [Precision]) END,
        [Confidence] = CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, [Confidence]) END,
        [FormattedAddress] = CASE WHEN @FormattedAddress_Clear = 1 THEN NULL ELSE ISNULL(@FormattedAddress, [FormattedAddress]) END,
        [Status] = ISNULL(@Status, [Status]),
        [GeocodingSource] = CASE WHEN @GeocodingSource_Clear = 1 THEN NULL ELSE ISNULL(@GeocodingSource, [GeocodingSource]) END,
        [GeocodedAt] = ISNULL(@GeocodedAt, [GeocodedAt]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGeoAddressCaches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGeoAddressCaches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeoAddressCache] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GeoAddressCache table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGeoAddressCache]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGeoAddressCache];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGeoAddressCache
ON [${flyway:defaultSchema}].[GeoAddressCache]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeoAddressCache]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GeoAddressCache] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Geo Address Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: spDeleteGeoAddressCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeoAddressCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGeoAddressCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGeoAddressCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGeoAddressCache]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GeoAddressCache]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Geo Address Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06f29304-912c-443e-bb69-e72da1fad278' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = '${flyway:defaultSchema}_Latitude')) BEGIN
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
            '06f29304-912c-443e-bb69-e72da1fad278',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100029,
            '${flyway:defaultSchema}_Latitude',
            'Mj Latitude',
            NULL,
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '058f9808-effb-4b33-b51e-40f984ee0926' OR (EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD' AND Name = '${flyway:defaultSchema}_Longitude')) BEGIN
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
            '058f9808-effb-4b33-b51e-40f984ee0926',
            'E08F1079-25F7-4451-997A-7D18B1515ACD', -- Entity: MJ: Geo Address Caches
            100030,
            '${flyway:defaultSchema}_Longitude',
            'Mj Longitude',
            NULL,
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set ExtendedType=GeoLatitude on virtual geo fields */
UPDATE [${flyway:defaultSchema}].[EntityField] SET [ExtendedType] = 'GeoLatitude' WHERE [Name] = '${flyway:defaultSchema}_Latitude' AND [ExtendedType] IS NULL AND [EntityID] IN ('E08F1079-25F7-4451-997A-7D18B1515ACD');

/* Set ExtendedType=GeoLongitude on virtual geo fields */
UPDATE [${flyway:defaultSchema}].[EntityField] SET [ExtendedType] = 'GeoLongitude' WHERE [Name] = '${flyway:defaultSchema}_Longitude' AND [ExtendedType] IS NULL AND [EntityID] IN ('E08F1079-25F7-4451-997A-7D18B1515ACD');




-- =============================================================================
-- HAND-WRITTEN CORRECTION (runs after the generated section above)
-- =============================================================================
-- CodeGen's LLM-based geo detection flags GeoAddressCache itself as a
-- geo-enabled entity (it has address-ish and lat/lng columns), which would make
-- the Scheduled Geocoding job try to geocode the cache table and add a
-- pointless RecordGeoCode JOIN to its base view. Lock geocoding support OFF:
--   * SupportsGeoCoding = 0 with AutoUpdateSupportsGeoCoding = 0 (documented
--     lock — CodeGen respects the flag and will not re-enable it)
--   * Clear the auto-assigned Geo* ExtendedTypes on the physical columns
--   * Remove the __mj_Latitude/__mj_Longitude virtual EntityField rows added by
--     the first generated section (the regenerated view below no longer exposes
--     them; leaving the rows would make entity_object RunViews select
--     nonexistent columns on fresh installs)
-- The second generated section below re-creates vwGeoAddressCaches WITHOUT the
-- geo JOIN and regenerates the CRUD procs against it.
-- =============================================================================

UPDATE ${flyway:defaultSchema}.Entity
SET SupportsGeoCoding = 0,
    AutoUpdateSupportsGeoCoding = 0
WHERE ID = 'E08F1079-25F7-4451-997A-7D18B1515ACD';

UPDATE ${flyway:defaultSchema}.EntityField
SET ExtendedType = NULL
WHERE EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD'
  AND ExtendedType IN ('GeoAddress', 'GeoLatitude', 'GeoLongitude');

DELETE FROM ${flyway:defaultSchema}.EntityField
WHERE EntityID = 'E08F1079-25F7-4451-997A-7D18B1515ACD'
  AND Name IN ('__mj_Latitude', '__mj_Longitude')
  AND IsVirtual = 1;



















































-- =============================================================================
-- =============================================================================
-- ==  EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION        ==
-- ==  CODEGEN TOOL (mj codegen) — DO NOT EDIT BY HAND.  (SECOND RUN)         ==
-- ==                                                                         ==
-- ==  Contains: the regenerated vwGeoAddressCaches base view WITHOUT the     ==
-- ==  RecordGeoCode geo JOIN (SupportsGeoCoding was locked to 0 by the       ==
-- ==  hand-written correction above), regenerated spCreate/spUpdate/         ==
-- ==  spDelete procs, and permission grants.                                 ==
-- ==                                                                         ==
-- ==  If the hand-written DDL above changes, re-run CodeGen and replace      ==
-- ==  this ENTIRE generated section with the new CodeGen_Run output.         ==
-- =============================================================================
-- =============================================================================

/* Base View SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: vwGeoAddressCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Geo Address Caches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GeoAddressCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGeoAddressCaches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGeoAddressCaches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGeoAddressCaches]
AS
SELECT
    g.*
FROM
    [${flyway:defaultSchema}].[GeoAddressCache] AS g
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGeoAddressCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: Permissions for vwGeoAddressCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGeoAddressCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: spCreateGeoAddressCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GeoAddressCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGeoAddressCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGeoAddressCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGeoAddressCache]
    @ID uniqueidentifier = NULL,
    @AddressHash nvarchar(64),
    @NormalizedAddress nvarchar(1000),
    @Latitude_Clear bit = 0,
    @Latitude decimal(10, 6) = NULL,
    @Longitude_Clear bit = 0,
    @Longitude decimal(10, 6) = NULL,
    @Precision_Clear bit = 0,
    @Precision nvarchar(20) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL,
    @FormattedAddress_Clear bit = 0,
    @FormattedAddress nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @GeocodingSource_Clear bit = 0,
    @GeocodingSource nvarchar(30) = NULL,
    @GeocodedAt datetimeoffset = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GeoAddressCache]
            (
                [ID],
                [AddressHash],
                [NormalizedAddress],
                [Latitude],
                [Longitude],
                [Precision],
                [Confidence],
                [FormattedAddress],
                [Status],
                [GeocodingSource],
                [GeocodedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AddressHash,
                @NormalizedAddress,
                CASE WHEN @Latitude_Clear = 1 THEN NULL ELSE ISNULL(@Latitude, NULL) END,
                CASE WHEN @Longitude_Clear = 1 THEN NULL ELSE ISNULL(@Longitude, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @FormattedAddress_Clear = 1 THEN NULL ELSE ISNULL(@FormattedAddress, NULL) END,
                ISNULL(@Status, 'success'),
                CASE WHEN @GeocodingSource_Clear = 1 THEN NULL ELSE ISNULL(@GeocodingSource, NULL) END,
                ISNULL(@GeocodedAt, sysdatetimeoffset()),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GeoAddressCache]
            (
                [AddressHash],
                [NormalizedAddress],
                [Latitude],
                [Longitude],
                [Precision],
                [Confidence],
                [FormattedAddress],
                [Status],
                [GeocodingSource],
                [GeocodedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AddressHash,
                @NormalizedAddress,
                CASE WHEN @Latitude_Clear = 1 THEN NULL ELSE ISNULL(@Latitude, NULL) END,
                CASE WHEN @Longitude_Clear = 1 THEN NULL ELSE ISNULL(@Longitude, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @FormattedAddress_Clear = 1 THEN NULL ELSE ISNULL(@FormattedAddress, NULL) END,
                ISNULL(@Status, 'success'),
                CASE WHEN @GeocodingSource_Clear = 1 THEN NULL ELSE ISNULL(@GeocodingSource, NULL) END,
                ISNULL(@GeocodedAt, sysdatetimeoffset()),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGeoAddressCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Geo Address Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: spUpdateGeoAddressCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GeoAddressCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGeoAddressCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGeoAddressCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGeoAddressCache]
    @ID uniqueidentifier,
    @AddressHash nvarchar(64) = NULL,
    @NormalizedAddress nvarchar(1000) = NULL,
    @Latitude_Clear bit = 0,
    @Latitude decimal(10, 6) = NULL,
    @Longitude_Clear bit = 0,
    @Longitude decimal(10, 6) = NULL,
    @Precision_Clear bit = 0,
    @Precision nvarchar(20) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL,
    @FormattedAddress_Clear bit = 0,
    @FormattedAddress nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @GeocodingSource_Clear bit = 0,
    @GeocodingSource nvarchar(30) = NULL,
    @GeocodedAt datetimeoffset = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeoAddressCache]
    SET
        [AddressHash] = ISNULL(@AddressHash, [AddressHash]),
        [NormalizedAddress] = ISNULL(@NormalizedAddress, [NormalizedAddress]),
        [Latitude] = CASE WHEN @Latitude_Clear = 1 THEN NULL ELSE ISNULL(@Latitude, [Latitude]) END,
        [Longitude] = CASE WHEN @Longitude_Clear = 1 THEN NULL ELSE ISNULL(@Longitude, [Longitude]) END,
        [Precision] = CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, [Precision]) END,
        [Confidence] = CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, [Confidence]) END,
        [FormattedAddress] = CASE WHEN @FormattedAddress_Clear = 1 THEN NULL ELSE ISNULL(@FormattedAddress, [FormattedAddress]) END,
        [Status] = ISNULL(@Status, [Status]),
        [GeocodingSource] = CASE WHEN @GeocodingSource_Clear = 1 THEN NULL ELSE ISNULL(@GeocodingSource, [GeocodingSource]) END,
        [GeocodedAt] = ISNULL(@GeocodedAt, [GeocodedAt]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGeoAddressCaches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGeoAddressCaches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeoAddressCache] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GeoAddressCache table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGeoAddressCache]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGeoAddressCache];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGeoAddressCache
ON [${flyway:defaultSchema}].[GeoAddressCache]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeoAddressCache]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GeoAddressCache] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Geo Address Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Geo Address Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Geo Address Caches
-- Item: spDeleteGeoAddressCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeoAddressCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGeoAddressCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGeoAddressCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGeoAddressCache]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GeoAddressCache]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Geo Address Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeoAddressCache] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BA3F1E42-E6E7-4496-8D35-3EABB003CAC9'
               AND AutoUpdateDefaultInView = 1;

