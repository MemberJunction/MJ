-- Migration: Geo Features — Reference Tables, RecordGeoCode, SQL Functions, Entity Metadata
-- Description: Phase 1 foundation for universal geo mapping capabilities in MemberJunction.
--              Creates Country and StateProvince reference tables, RecordGeoCode polymorphic
--              geocoding results table, Haversine distance scalar function, radius query TVF,
--              and adds SupportsGeoCoding / AutoUpdateSupportsGeoCoding to Entity table and
--              AutoUpdateExtendedType to EntityField table.


-- fix a stale view 
EXEC sp_refreshview '${flyway:defaultSchema}.vwApplicationEntities';


-- ============================================================================
-- Table 1: Country
-- Reference table for countries with ISO codes, centroids, and boundary GeoJSON.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.Country (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    ISO2 NVARCHAR(2) NOT NULL,
    ISO3 NVARCHAR(3) NOT NULL,
    NumericCode INT NULL,
    Latitude DECIMAL(10,6) NULL,
    Longitude DECIMAL(10,6) NULL,
    BoundaryGeoJSON NVARCHAR(MAX) NULL,
    CommonAliases NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Country PRIMARY KEY (ID),
    CONSTRAINT UQ_Country_ISO2 UNIQUE (ISO2),
    CONSTRAINT UQ_Country_ISO3 UNIQUE (ISO3),
    CONSTRAINT UQ_Country_Name UNIQUE (Name)
);

-- Extended properties: Country table
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Reference table for countries with ISO 3166-1 codes, geographic centroids, and optional medium-resolution boundary GeoJSON for choropleth rendering. Seeded with ~250 countries.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Country';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Full country name (e.g., "United States", "Canada").',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Country',
    @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ISO 3166-1 alpha-2 code (e.g., "US", "CA"). Unique business key for lookups.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Country',
    @level2type=N'COLUMN', @level2name=N'ISO2';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ISO 3166-1 alpha-3 code (e.g., "USA", "CAN"). Unique business key for lookups.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Country',
    @level2type=N'COLUMN', @level2name=N'ISO3';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ISO 3166-1 numeric code (e.g., 840 for US, 124 for Canada).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Country',
    @level2type=N'COLUMN', @level2name=N'NumericCode';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Geographic centroid latitude. Used as fallback point for country-level geocoding.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Country',
    @level2type=N'COLUMN', @level2name=N'Latitude';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Geographic centroid longitude. Used as fallback point for country-level geocoding.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Country',
    @level2type=N'COLUMN', @level2name=N'Longitude';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Medium-resolution (~50m) GeoJSON boundary polygon for choropleth map rendering. Nullable — point map falls back to centroid if absent. Total ~3MB for all countries.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Country',
    @level2type=N'COLUMN', @level2name=N'BoundaryGeoJSON';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON array of common aliases and alternate names (e.g., ["United States","USA","U.S.","America"]). Used by GeoResolver for fuzzy text-to-country matching.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Country',
    @level2type=N'COLUMN', @level2name=N'CommonAliases';


-- ============================================================================
-- Table 2: StateProvince
-- Reference table for states/provinces with ISO codes, centroids, and boundaries.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.StateProvince (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CountryID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Code NVARCHAR(10) NOT NULL,
    ISO3166_2 NVARCHAR(10) NOT NULL,
    Latitude DECIMAL(10,6) NULL,
    Longitude DECIMAL(10,6) NULL,
    BoundaryGeoJSON NVARCHAR(MAX) NULL,
    CommonAliases NVARCHAR(MAX) NULL,
    CONSTRAINT PK_StateProvince PRIMARY KEY (ID),
    CONSTRAINT FK_StateProvince_Country FOREIGN KEY (CountryID)
        REFERENCES ${flyway:defaultSchema}.Country(ID),
    CONSTRAINT UQ_StateProvince_ISO3166_2 UNIQUE (ISO3166_2),
    CONSTRAINT UQ_StateProvince_CountryCode UNIQUE (CountryID, Code)
);

-- Extended properties: StateProvince table
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Reference table for states, provinces, and first-level administrative divisions. Linked to Country via FK. Seeded with ~5,000 records with ISO 3166-2 codes, centroids, and optional boundary GeoJSON.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'StateProvince';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to Country. Establishes the parent country for this state/province.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'StateProvince',
    @level2type=N'COLUMN', @level2name=N'CountryID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Full state/province name (e.g., "California", "Ontario").',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'StateProvince',
    @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Short code within the country (e.g., "CA", "ON"). Unique per country via compound constraint.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'StateProvince',
    @level2type=N'COLUMN', @level2name=N'Code';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ISO 3166-2 subdivision code (e.g., "US-CA", "CA-ON"). Globally unique.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'StateProvince',
    @level2type=N'COLUMN', @level2name=N'ISO3166_2';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Geographic centroid latitude. Used as fallback point for state-level geocoding.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'StateProvince',
    @level2type=N'COLUMN', @level2name=N'Latitude';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Geographic centroid longitude. Used as fallback point for state-level geocoding.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'StateProvince',
    @level2type=N'COLUMN', @level2name=N'Longitude';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Medium-resolution (~50m) GeoJSON boundary polygon for choropleth map rendering. Nullable. Total ~15-20MB for all states/provinces worldwide.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'StateProvince',
    @level2type=N'COLUMN', @level2name=N'BoundaryGeoJSON';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON array of common aliases (e.g., ["Calif.","California","Cal"]). Used by GeoResolver for fuzzy text-to-state matching.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'StateProvince',
    @level2type=N'COLUMN', @level2name=N'CommonAliases';


-- ============================================================================
-- Table 3: RecordGeoCode
-- Polymorphic table storing persisted geocoding results for any entity record.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.RecordGeoCode (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    RecordID NVARCHAR(450) NOT NULL,
    LocationType NVARCHAR(50) NOT NULL DEFAULT 'Primary',
    Latitude DECIMAL(10,6) NULL,
    Longitude DECIMAL(10,6) NULL,
    Precision NVARCHAR(20) NULL,
    CountryID UNIQUEIDENTIFIER NULL,
    StateProvinceID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'pending',
    ErrorMessage NVARCHAR(MAX) NULL,
    RetryCount INT NOT NULL DEFAULT 0,
    SourceFieldHash NVARCHAR(64) NULL,
    GeocodedAt DATETIMEOFFSET NULL,
    GeocodingSource NVARCHAR(30) NULL,
    CONSTRAINT PK_RecordGeoCode PRIMARY KEY (ID),
    CONSTRAINT FK_RecordGeoCode_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_RecordGeoCode_Country FOREIGN KEY (CountryID)
        REFERENCES ${flyway:defaultSchema}.Country(ID),
    CONSTRAINT FK_RecordGeoCode_StateProvince FOREIGN KEY (StateProvinceID)
        REFERENCES ${flyway:defaultSchema}.StateProvince(ID),
    CONSTRAINT UQ_RecordGeoCode_EntityRecordLocation UNIQUE (EntityID, RecordID, LocationType),
    CONSTRAINT CK_RecordGeoCode_Precision
        CHECK (Precision IN ('exact', 'postal_code', 'city', 'county', 'state_province', 'country')),
    CONSTRAINT CK_RecordGeoCode_Status
        CHECK (Status IN ('success', 'failed', 'pending')),
    CONSTRAINT CK_RecordGeoCode_GeocodingSource
        CHECK (GeocodingSource IN ('google', 'reference_data', 'manual', 'ip_geolocation', 'native', 'reverse'))
);

-- Extended properties: RecordGeoCode table
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Polymorphic table storing persisted geocoding results for any MJ entity record. Each row maps an entity record + location type to a lat/lng coordinate, with optional country/state references for choropleth grouping. Supports multi-location entities via LocationType discriminator.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to Entity. Identifies which entity this geocode belongs to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'EntityID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJ composite primary key format string identifying the source record (e.g., "ID|<uuid>"). Max 450 chars for SQL Server index support.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'RecordID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Discriminator for multi-location entities. Default "Primary" for single-address entities. Multi-address examples: "Home", "Business", "Mailing", "PO Box".',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'LocationType';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Geocoded latitude coordinate. NULL when Status is "pending" or "failed".',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'Latitude';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Geocoded longitude coordinate. NULL when Status is "pending" or "failed".',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'Longitude';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Precision level of the geocoded result: exact (street address), postal_code, city, county, state_province, or country.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'Precision';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional FK to Country reference table. Populated alongside lat/lng to enable choropleth grouping without reverse-geocoding at render time.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'CountryID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional FK to StateProvince reference table. Populated alongside lat/lng to enable state-level choropleth grouping.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'StateProvinceID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current geocoding status: "pending" (awaiting geocode), "success" (geocoded), or "failed" (geocoding error). Used by scheduled job for retry logic.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'Status';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Error details when Status is "failed". Captures API error messages, rate limit info, etc. for debugging.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'ErrorMessage';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of geocoding attempts. Used for exponential backoff in the scheduled retry job. Stops retrying at configurable maxRetries (default 3).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'RetryCount';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'SHA-256 hash of the source field values that produced this geocode. When source fields change on save, the hash won''t match and re-geocoding is triggered. Format: SHA-256(concat(field1, "|", field2, ...)).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'SourceFieldHash';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of when geocoding was last attempted (success or failure).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'GeocodedAt';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How this geocode was produced: google (Google Geocoding API), reference_data (resolved via Country/StateProvince tables), manual (user-entered), ip_geolocation (IP lookup), native (copied from entity lat/lng fields), reverse (reverse geocode from coordinates).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'RecordGeoCode',
    @level2type=N'COLUMN', @level2name=N'GeocodingSource';

GO

-- Function: fn_MJ_GeoDistance (Scalar — Haversine formula)
-- Returns the great-circle distance between two lat/lng points.
-- Unit: 'mi' for miles, 'km' for kilometers.
CREATE FUNCTION ${flyway:defaultSchema}.fn_MJ_GeoDistance(
    @Lat1 DECIMAL(10,6),
    @Lng1 DECIMAL(10,6),
    @Lat2 DECIMAL(10,6),
    @Lng2 DECIMAL(10,6),
    @Unit NVARCHAR(2)
)
RETURNS FLOAT
AS
BEGIN
    DECLARE @R FLOAT = CASE WHEN @Unit = 'km' THEN 6371.0 ELSE 3959.0 END;
    IF @Lat1 IS NULL OR @Lng1 IS NULL OR @Lat2 IS NULL OR @Lng2 IS NULL
        RETURN NULL;
    DECLARE @Lat1Rad FLOAT = RADIANS(CAST(@Lat1 AS FLOAT));
    DECLARE @Lat2Rad FLOAT = RADIANS(CAST(@Lat2 AS FLOAT));
    DECLARE @DeltaLat FLOAT = RADIANS(CAST(@Lat2 - @Lat1 AS FLOAT));
    DECLARE @DeltaLng FLOAT = RADIANS(CAST(@Lng2 - @Lng1 AS FLOAT));
    DECLARE @A FLOAT = SIN(@DeltaLat / 2.0) * SIN(@DeltaLat / 2.0)
                     + COS(@Lat1Rad) * COS(@Lat2Rad)
                     * SIN(@DeltaLng / 2.0) * SIN(@DeltaLng / 2.0);
    DECLARE @C FLOAT = 2.0 * ATN2(SQRT(@A), SQRT(1.0 - @A));
    RETURN @R * @C;
END

GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Calculates great-circle distance between two geographic points using the Haversine formula. Returns distance in miles (unit="mi") or kilometers (unit="km"). Baseline MJ geo infrastructure.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'FUNCTION', @level1name=N'fn_MJ_GeoDistance';

GO

-- Function: fn_MJ_GeoRecordsNear (Inline Table-Valued Function)
-- Returns RecordGeoCode rows within a given radius of a center point.
-- Uses bounding box pre-filter for index usage, then Haversine for precision.
CREATE FUNCTION ${flyway:defaultSchema}.fn_MJ_GeoRecordsNear(
    @EntityName NVARCHAR(500),
    @CenterLat DECIMAL(10,6),
    @CenterLng DECIMAL(10,6),
    @Radius FLOAT,
    @Unit NVARCHAR(2)
)
RETURNS TABLE
AS
RETURN (
    WITH BoundingBox AS (
        SELECT
            @Radius / (CASE WHEN @Unit = 'km' THEN 111.0 ELSE 69.0 END) AS LatDelta,
            @Radius / (CASE WHEN @Unit = 'km' THEN 111.0 ELSE 69.0 END
                        * COS(RADIANS(CAST(@CenterLat AS FLOAT)))) AS LngDelta
    )
    SELECT
        rgc.ID,
        rgc.EntityID,
        rgc.RecordID,
        rgc.LocationType,
        rgc.Latitude,
        rgc.Longitude,
        rgc.Precision,
        rgc.CountryID,
        rgc.StateProvinceID,
        rgc.Status,
        rgc.GeocodingSource,
        ${flyway:defaultSchema}.fn_MJ_GeoDistance(
            rgc.Latitude, rgc.Longitude,
            @CenterLat, @CenterLng,
            @Unit
        ) AS Distance
    FROM ${flyway:defaultSchema}.RecordGeoCode rgc
    INNER JOIN ${flyway:defaultSchema}.Entity e ON e.ID = rgc.EntityID
    CROSS JOIN BoundingBox bb
    WHERE e.Name = @EntityName
      AND rgc.Status = 'success'
      AND rgc.Latitude IS NOT NULL
      AND rgc.Longitude IS NOT NULL
      AND rgc.Latitude  BETWEEN @CenterLat - bb.LatDelta AND @CenterLat + bb.LatDelta
      AND rgc.Longitude BETWEEN @CenterLng - bb.LngDelta AND @CenterLng + bb.LngDelta
      AND ${flyway:defaultSchema}.fn_MJ_GeoDistance(
              rgc.Latitude, rgc.Longitude,
              @CenterLat, @CenterLng,
              @Unit
          ) <= @Radius
)

GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Inline table-valued function that returns RecordGeoCode rows within a given radius of a center point. Uses bounding box pre-filter for index utilization, then Haversine for precision. Takes Entity Name (unique string) for readability. Baseline MJ geo infrastructure.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'FUNCTION', @level1name=N'fn_MJ_GeoRecordsNear';














































-- CODE GEN RUN
/* SQL generated to create new entity MJ: Countries */

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
         [AllowUserSearchAPI]
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
         '3bfe55c1-8fd5-44a4-accb-dabb4e8428e2',
         'MJ: Countries',
         'Countries',
         'Reference table for countries with ISO 3166-1 codes, geographic centroids, and optional medium-resolution boundary GeoJSON for choropleth rendering. Seeded with ~250 countries.',
         NULL,
         'Country',
         'vwCountries',
         '${flyway:defaultSchema}',
         1,
         0
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
      )
   

/* SQL generated to add new entity MJ: Countries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3bfe55c1-8fd5-44a4-accb-dabb4e8428e2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Countries for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3bfe55c1-8fd5-44a4-accb-dabb4e8428e2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Countries for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3bfe55c1-8fd5-44a4-accb-dabb4e8428e2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Countries for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3bfe55c1-8fd5-44a4-accb-dabb4e8428e2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: State Provinces */

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
         [AllowUserSearchAPI]
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
         '12c21789-12cc-4a8c-81ed-ffcbc1d69336',
         'MJ: State Provinces',
         'State Provinces',
         'Reference table for states, provinces, and first-level administrative divisions. Linked to Country via FK. Seeded with ~5,000 records with ISO 3166-2 codes, centroids, and optional boundary GeoJSON.',
         NULL,
         'StateProvince',
         'vwStateProvinces',
         '${flyway:defaultSchema}',
         1,
         0
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
      )
   

/* SQL generated to add new entity MJ: State Provinces to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '12c21789-12cc-4a8c-81ed-ffcbc1d69336', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: State Provinces for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('12c21789-12cc-4a8c-81ed-ffcbc1d69336', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: State Provinces for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('12c21789-12cc-4a8c-81ed-ffcbc1d69336', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: State Provinces for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('12c21789-12cc-4a8c-81ed-ffcbc1d69336', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Record Geo Codes */

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
         [AllowUserSearchAPI]
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
         '54ef915a-9902-4958-8e09-ae6e7b525e97',
         'MJ: Record Geo Codes',
         'Record Geo Codes',
         'Polymorphic table storing persisted geocoding results for any MJ entity record. Each row maps an entity record + location type to a lat/lng coordinate, with optional country/state references for choropleth grouping. Supports multi-location entities via LocationType discriminator.',
         NULL,
         'RecordGeoCode',
         'vwRecordGeoCodes',
         '${flyway:defaultSchema}',
         1,
         0
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
      )
   

/* SQL generated to add new entity MJ: Record Geo Codes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '54ef915a-9902-4958-8e09-ae6e7b525e97', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Record Geo Codes for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('54ef915a-9902-4958-8e09-ae6e7b525e97', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Record Geo Codes for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('54ef915a-9902-4958-8e09-ae6e7b525e97', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Record Geo Codes for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('54ef915a-9902-4958-8e09-ae6e7b525e97', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
UPDATE [${flyway:defaultSchema}].[RecordGeoCode] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ADD CONSTRAINT [DF___mj_RecordGeoCode___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
UPDATE [${flyway:defaultSchema}].[RecordGeoCode] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ADD CONSTRAINT [DF___mj_RecordGeoCode___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Country */
UPDATE [${flyway:defaultSchema}].[Country] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ADD CONSTRAINT [DF___mj_Country___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Country */
UPDATE [${flyway:defaultSchema}].[Country] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ADD CONSTRAINT [DF___mj_Country___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.StateProvince */
UPDATE [${flyway:defaultSchema}].[StateProvince] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ADD CONSTRAINT [DF___mj_StateProvince___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.StateProvince */
UPDATE [${flyway:defaultSchema}].[StateProvince] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ADD CONSTRAINT [DF___mj_StateProvince___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '797360ef-109d-4a8f-b040-5b2141db37c5' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'ID')) BEGIN
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
            '797360ef-109d-4a8f-b040-5b2141db37c5',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2174c80e-d364-4dba-92f6-eeaada410bd7' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'EntityID')) BEGIN
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
            '2174c80e-d364-4dba-92f6-eeaada410bd7',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100002,
            'EntityID',
            'Entity ID',
            'Foreign key to Entity. Identifies which entity this geocode belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f51815bb-b7f2-476f-b0b4-8119eeede33b' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'RecordID')) BEGIN
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
            'f51815bb-b7f2-476f-b0b4-8119eeede33b',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100003,
            'RecordID',
            'Record ID',
            'MJ composite primary key format string identifying the source record (e.g., "ID|<uuid>"). Max 450 chars for SQL Server index support.',
            'nvarchar',
            900,
            0,
            0,
            0,
            NULL,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3e3af4a-10e0-443a-a744-c6cd004c5c31' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'LocationType')) BEGIN
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
            'f3e3af4a-10e0-443a-a744-c6cd004c5c31',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100004,
            'LocationType',
            'Location Type',
            'Discriminator for multi-location entities. Default "Primary" for single-address entities. Multi-address examples: "Home", "Business", "Mailing", "PO Box".',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Primary',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bad1868e-5d5a-4287-afcf-352c2a3e6699' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'Latitude')) BEGIN
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
            'bad1868e-5d5a-4287-afcf-352c2a3e6699',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100005,
            'Latitude',
            'Latitude',
            'Geocoded latitude coordinate. NULL when Status is "pending" or "failed".',
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ec46b3e9-73ab-48cd-b231-4d7312badbbe' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'Longitude')) BEGIN
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
            'ec46b3e9-73ab-48cd-b231-4d7312badbbe',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100006,
            'Longitude',
            'Longitude',
            'Geocoded longitude coordinate. NULL when Status is "pending" or "failed".',
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ccd7fd8-7341-499f-b199-4d65d87203db' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'Precision')) BEGIN
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
            '4ccd7fd8-7341-499f-b199-4d65d87203db',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100007,
            'Precision',
            'Precision',
            'Precision level of the geocoded result: exact (street address), postal_code, city, county, state_province, or country.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82f838dd-b57b-4aad-aef1-04e381e2971f' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'CountryID')) BEGIN
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
            '82f838dd-b57b-4aad-aef1-04e381e2971f',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100008,
            'CountryID',
            'Country ID',
            'Optional FK to Country reference table. Populated alongside lat/lng to enable choropleth grouping without reverse-geocoding at render time.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73458121-bbfc-40fa-a093-d2b939839211' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'StateProvinceID')) BEGIN
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
            '73458121-bbfc-40fa-a093-d2b939839211',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100009,
            'StateProvinceID',
            'State Province ID',
            'Optional FK to StateProvince reference table. Populated alongside lat/lng to enable state-level choropleth grouping.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32396f7d-f786-4612-ba91-78006867fc63' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'Status')) BEGIN
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
            '32396f7d-f786-4612-ba91-78006867fc63',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100010,
            'Status',
            'Status',
            'Current geocoding status: "pending" (awaiting geocode), "success" (geocoded), or "failed" (geocoding error). Used by scheduled job for retry logic.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'pending',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b5fe6b9-b64f-401b-aef2-1613456109e5' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'ErrorMessage')) BEGIN
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
            '2b5fe6b9-b64f-401b-aef2-1613456109e5',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100011,
            'ErrorMessage',
            'Error Message',
            'Error details when Status is "failed". Captures API error messages, rate limit info, etc. for debugging.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4dae2800-36fc-49c5-8d3e-64eaf15708a0' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'RetryCount')) BEGIN
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
            '4dae2800-36fc-49c5-8d3e-64eaf15708a0',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100012,
            'RetryCount',
            'Retry Count',
            'Number of geocoding attempts. Used for exponential backoff in the scheduled retry job. Stops retrying at configurable maxRetries (default 3).',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1b38354-d8a9-4079-a15f-8eccfd558576' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'SourceFieldHash')) BEGIN
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
            'b1b38354-d8a9-4079-a15f-8eccfd558576',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100013,
            'SourceFieldHash',
            'Source Field Hash',
            'SHA-256 hash of the source field values that produced this geocode. When source fields change on save, the hash won''t match and re-geocoding is triggered. Format: SHA-256(concat(field1, "|", field2, ...)).',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '46621b92-adb4-4206-a660-2d93b634e7a4' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'GeocodedAt')) BEGIN
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
            '46621b92-adb4-4206-a660-2d93b634e7a4',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100014,
            'GeocodedAt',
            'Geocoded At',
            'Timestamp of when geocoding was last attempted (success or failure).',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bca87cf8-5989-4a92-ba21-3b3b409401ab' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'GeocodingSource')) BEGIN
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
            'bca87cf8-5989-4a92-ba21-3b3b409401ab',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100015,
            'GeocodingSource',
            'Geocoding Source',
            'How this geocode was produced: google (Google Geocoding API), reference_data (resolved via Country/StateProvince tables), manual (user-entered), ip_geolocation (IP lookup), native (copied from entity lat/lng fields), reverse (reverse geocode from coordinates).',
            'nvarchar',
            60,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '04104288-e86f-4f22-a8cf-3a6ae181311e' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = '__mj_CreatedAt')) BEGIN
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
            '04104288-e86f-4f22-a8cf-3a6ae181311e',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100016,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '731bba14-51fc-47dd-9240-62cb3ec58af6' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '731bba14-51fc-47dd-9240-62cb3ec58af6',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100017,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c45f5a7d-ab58-482e-9a71-1997f54736c4' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = 'ID')) BEGIN
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
            'c45f5a7d-ab58-482e-9a71-1997f54736c4',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff0e4edf-1d03-40d5-bfac-659fea2d4047' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = 'Name')) BEGIN
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
            'ff0e4edf-1d03-40d5-bfac-659fea2d4047',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100002,
            'Name',
            'Name',
            'Full country name (e.g., "United States", "Canada").',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ec04f8e-5f7b-4d54-9cfa-3eddece50637' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = 'ISO2')) BEGIN
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
            '1ec04f8e-5f7b-4d54-9cfa-3eddece50637',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100003,
            'ISO2',
            'Iso 2',
            'ISO 3166-1 alpha-2 code (e.g., "US", "CA"). Unique business key for lookups.',
            'nvarchar',
            4,
            0,
            0,
            0,
            NULL,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ae14f22-8e67-4428-a540-7210fd37d4f3' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = 'ISO3')) BEGIN
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
            '3ae14f22-8e67-4428-a540-7210fd37d4f3',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100004,
            'ISO3',
            'Iso 3',
            'ISO 3166-1 alpha-3 code (e.g., "USA", "CAN"). Unique business key for lookups.',
            'nvarchar',
            6,
            0,
            0,
            0,
            NULL,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ac735dfc-8a31-4450-a0bd-eb42dc50f4dd' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = 'NumericCode')) BEGIN
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
            'ac735dfc-8a31-4450-a0bd-eb42dc50f4dd',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100005,
            'NumericCode',
            'Numeric Code',
            'ISO 3166-1 numeric code (e.g., 840 for US, 124 for Canada).',
            'int',
            4,
            10,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e9de72d2-0320-42d6-b367-512ea1fb6a61' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = 'Latitude')) BEGIN
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
            'e9de72d2-0320-42d6-b367-512ea1fb6a61',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100006,
            'Latitude',
            'Latitude',
            'Geographic centroid latitude. Used as fallback point for country-level geocoding.',
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd0b9cd33-3b5d-48d5-9e0c-979d906a89a7' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = 'Longitude')) BEGIN
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
            'd0b9cd33-3b5d-48d5-9e0c-979d906a89a7',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100007,
            'Longitude',
            'Longitude',
            'Geographic centroid longitude. Used as fallback point for country-level geocoding.',
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16649f72-2bc6-4849-9f04-ed5152af4973' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = 'BoundaryGeoJSON')) BEGIN
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
            '16649f72-2bc6-4849-9f04-ed5152af4973',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100008,
            'BoundaryGeoJSON',
            'Boundary Geo JSON',
            'Medium-resolution (~50m) GeoJSON boundary polygon for choropleth map rendering. Nullable — point map falls back to centroid if absent. Total ~3MB for all countries.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c2d067e-8e65-4734-8aa6-d15a4616423f' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = 'CommonAliases')) BEGIN
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
            '5c2d067e-8e65-4734-8aa6-d15a4616423f',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100009,
            'CommonAliases',
            'Common Aliases',
            'JSON array of common aliases and alternate names (e.g., ["United States","USA","U.S.","America"]). Used by GeoResolver for fuzzy text-to-country matching.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fab840e-b124-4da6-8b93-83e04e1ccec5' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = '__mj_CreatedAt')) BEGIN
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
            '2fab840e-b124-4da6-8b93-83e04e1ccec5',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100010,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '547f24f8-8693-44aa-94a3-46d9d920b538' OR (EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '547f24f8-8693-44aa-94a3-46d9d920b538',
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', -- Entity: MJ: Countries
            100011,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd152568a-2ade-444c-b90d-25e0ea572e5d' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'ID')) BEGIN
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
            'd152568a-2ade-444c-b90d-25e0ea572e5d',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91bf2a06-1c23-46f9-8d79-a81015836573' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'CountryID')) BEGIN
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
            '91bf2a06-1c23-46f9-8d79-a81015836573',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100002,
            'CountryID',
            'Country ID',
            'Foreign key to Country. Establishes the parent country for this state/province.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22834f17-39bf-4b4f-bb12-ac82b5d27812' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'Name')) BEGIN
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
            '22834f17-39bf-4b4f-bb12-ac82b5d27812',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100003,
            'Name',
            'Name',
            'Full state/province name (e.g., "California", "Ontario").',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67b42824-236e-4d32-a44e-ba69b2675d85' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'Code')) BEGIN
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
            '67b42824-236e-4d32-a44e-ba69b2675d85',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100004,
            'Code',
            'Code',
            'Short code within the country (e.g., "CA", "ON"). Unique per country via compound constraint.',
            'nvarchar',
            20,
            0,
            0,
            0,
            NULL,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a32988c3-192d-4cc2-a84a-2080546bc47d' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'ISO3166_2')) BEGIN
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
            'a32988c3-192d-4cc2-a84a-2080546bc47d',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100005,
            'ISO3166_2',
            'Iso 31662',
            'ISO 3166-2 subdivision code (e.g., "US-CA", "CA-ON"). Globally unique.',
            'nvarchar',
            20,
            0,
            0,
            0,
            NULL,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f53e01c8-6574-4ae2-9bce-6b4872e4e768' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'Latitude')) BEGIN
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
            'f53e01c8-6574-4ae2-9bce-6b4872e4e768',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100006,
            'Latitude',
            'Latitude',
            'Geographic centroid latitude. Used as fallback point for state-level geocoding.',
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69d0fb57-2826-4db9-a4f9-8f5f1eae68a1' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'Longitude')) BEGIN
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
            '69d0fb57-2826-4db9-a4f9-8f5f1eae68a1',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100007,
            'Longitude',
            'Longitude',
            'Geographic centroid longitude. Used as fallback point for state-level geocoding.',
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e447afd-91e9-4d6b-9ec7-d1a55b82145b' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'BoundaryGeoJSON')) BEGIN
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
            '1e447afd-91e9-4d6b-9ec7-d1a55b82145b',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100008,
            'BoundaryGeoJSON',
            'Boundary Geo JSON',
            'Medium-resolution (~50m) GeoJSON boundary polygon for choropleth map rendering. Nullable. Total ~15-20MB for all states/provinces worldwide.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1614c4f0-7ec6-440b-835f-6a5d826e4eb8' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'CommonAliases')) BEGIN
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
            '1614c4f0-7ec6-440b-835f-6a5d826e4eb8',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100009,
            'CommonAliases',
            'Common Aliases',
            'JSON array of common aliases (e.g., ["Calif.","California","Cal"]). Used by GeoResolver for fuzzy text-to-state matching.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dce8dadc-f9ff-4cf7-bb42-5e361dd4a582' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = '__mj_CreatedAt')) BEGIN
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
            'dce8dadc-f9ff-4cf7-bb42-5e361dd4a582',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100010,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e6c31e8-d3ab-478b-8a5e-639a60ca0fd1' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '9e6c31e8-d3ab-478b-8a5e-639a60ca0fd1',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100011,
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
      END

/* SQL text to insert entity field value with ID 4fc56d01-b080-4ea7-850d-3ca91a48ee9f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4fc56d01-b080-4ea7-850d-3ca91a48ee9f', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 1, 'city', 'city', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID f79b8613-89e5-431a-94ea-bd13f5007f59 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f79b8613-89e5-431a-94ea-bd13f5007f59', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 2, 'country', 'country', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ec878e18-0a70-4d2c-aa1e-75ff460787c9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ec878e18-0a70-4d2c-aa1e-75ff460787c9', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 3, 'county', 'county', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID db0047cf-7899-4465-aaed-7123f4d8a49f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('db0047cf-7899-4465-aaed-7123f4d8a49f', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 4, 'exact', 'exact', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID faf85ba4-421e-45c5-964a-107ba06ef68f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('faf85ba4-421e-45c5-964a-107ba06ef68f', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 5, 'postal_code', 'postal_code', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 862d3ae5-ee6c-424f-b1d4-1de629cfb84a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('862d3ae5-ee6c-424f-b1d4-1de629cfb84a', '4CCD7FD8-7341-499F-B199-4D65D87203DB', 6, 'state_province', 'state_province', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 4CCD7FD8-7341-499F-B199-4D65D87203DB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4CCD7FD8-7341-499F-B199-4D65D87203DB'

/* SQL text to insert entity field value with ID b7b9d7b7-fb1e-470b-bdf9-7591a51d70c1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b7b9d7b7-fb1e-470b-bdf9-7591a51d70c1', '32396F7D-F786-4612-BA91-78006867FC63', 1, 'failed', 'failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 25692691-a9ce-45b1-b77e-0cf4f027d95b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('25692691-a9ce-45b1-b77e-0cf4f027d95b', '32396F7D-F786-4612-BA91-78006867FC63', 2, 'pending', 'pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 357b6064-947e-4a81-a78b-df0cc42d0cf9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('357b6064-947e-4a81-a78b-df0cc42d0cf9', '32396F7D-F786-4612-BA91-78006867FC63', 3, 'success', 'success', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 32396F7D-F786-4612-BA91-78006867FC63 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='32396F7D-F786-4612-BA91-78006867FC63'

/* SQL text to insert entity field value with ID 13834a14-5c08-4125-bd68-46cf939850b3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('13834a14-5c08-4125-bd68-46cf939850b3', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 1, 'google', 'google', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 86d9583e-8de4-436f-905a-61572273bdb7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('86d9583e-8de4-436f-905a-61572273bdb7', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 2, 'ip_geolocation', 'ip_geolocation', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 19ffd25e-c31f-4d80-9523-e4ffe623c1e7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('19ffd25e-c31f-4d80-9523-e4ffe623c1e7', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 3, 'manual', 'manual', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e8e2a502-5c51-4937-af6e-9d13e3a3735c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e8e2a502-5c51-4937-af6e-9d13e3a3735c', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 4, 'native', 'native', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 786b8847-be88-4460-bcff-5aa41afce2ff */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('786b8847-be88-4460-bcff-5aa41afce2ff', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 5, 'reference_data', 'reference_data', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID d12f1417-677f-46f9-a337-d9d002ce2b2e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d12f1417-677f-46f9-a337-d9d002ce2b2e', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 6, 'reverse', 'reverse', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID BCA87CF8-5989-4A92-BA21-3B3B409401AB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BCA87CF8-5989-4A92-BA21-3B3B409401AB'


/* Create Entity Relationship: MJ: Entities -> MJ: Record Geo Codes (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dbc9cb91-f2de-4e75-a4a6-4390e8ae7015'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dbc9cb91-f2de-4e75-a4a6-4390e8ae7015', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'EntityID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Countries -> MJ: Record Geo Codes (One To Many via CountryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd55a888d-11b0-47c0-89bc-b90aed85ad00'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d55a888d-11b0-47c0-89bc-b90aed85ad00', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'CountryID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Countries -> MJ: State Provinces (One To Many via CountryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c8d7452a-bf0b-4697-92c9-e5242fc5dcde'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c8d7452a-bf0b-4697-92c9-e5242fc5dcde', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', 'CountryID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: State Provinces -> MJ: Record Geo Codes (One To Many via StateProvinceID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '61911e66-8e4d-4eb3-82aa-80234bc9e6e6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('61911e66-8e4d-4eb3-82aa-80234bc9e6e6', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'StateProvinceID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for ApplicationEntity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table ApplicationEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ApplicationEntity_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ApplicationEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ApplicationEntity_ApplicationID ON [${flyway:defaultSchema}].[ApplicationEntity] ([ApplicationID]);

-- Index for foreign key EntityID in table ApplicationEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ApplicationEntity_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ApplicationEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ApplicationEntity_EntityID ON [${flyway:defaultSchema}].[ApplicationEntity] ([EntityID]);

/* Base View Permissions SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: Permissions for vwApplicationEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwApplicationEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spCreateApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateApplicationEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateApplicationEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateApplicationEntity]
    @ID uniqueidentifier = NULL,
    @ApplicationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @DefaultForNewUser bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
            (
                [ID],
                [ApplicationID],
                [EntityID],
                [Sequence],
                [DefaultForNewUser]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ApplicationID,
                @EntityID,
                @Sequence,
                ISNULL(@DefaultForNewUser, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
            (
                [ApplicationID],
                [EntityID],
                [Sequence],
                [DefaultForNewUser]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ApplicationID,
                @EntityID,
                @Sequence,
                ISNULL(@DefaultForNewUser, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwApplicationEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplicationEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Application Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplicationEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spUpdateApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateApplicationEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateApplicationEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateApplicationEntity]
    @ID uniqueidentifier,
    @ApplicationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ApplicationEntity]
    SET
        [ApplicationID] = @ApplicationID,
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [DefaultForNewUser] = @DefaultForNewUser
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwApplicationEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwApplicationEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplicationEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ApplicationEntity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateApplicationEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateApplicationEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateApplicationEntity
ON [${flyway:defaultSchema}].[ApplicationEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ApplicationEntity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ApplicationEntity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Application Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplicationEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spDeleteApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteApplicationEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteApplicationEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplicationEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ApplicationEntity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplicationEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Application Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplicationEntity] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for Country */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: vwCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Countries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Country
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCountries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCountries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCountries]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[Country] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCountries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: Permissions for vwCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCountries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: spCreateCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Country
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCountry]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCountry];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCountry]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @ISO2 nvarchar(2),
    @ISO3 nvarchar(3),
    @NumericCode int,
    @Latitude decimal(10, 6),
    @Longitude decimal(10, 6),
    @BoundaryGeoJSON nvarchar(MAX),
    @CommonAliases nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Country]
            (
                [ID],
                [Name],
                [ISO2],
                [ISO3],
                [NumericCode],
                [Latitude],
                [Longitude],
                [BoundaryGeoJSON],
                [CommonAliases]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ISO2,
                @ISO3,
                @NumericCode,
                @Latitude,
                @Longitude,
                @BoundaryGeoJSON,
                @CommonAliases
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Country]
            (
                [Name],
                [ISO2],
                [ISO3],
                [NumericCode],
                [Latitude],
                [Longitude],
                [BoundaryGeoJSON],
                [CommonAliases]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ISO2,
                @ISO3,
                @NumericCode,
                @Latitude,
                @Longitude,
                @BoundaryGeoJSON,
                @CommonAliases
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCountries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCountry] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Countries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCountry] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: spUpdateCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Country
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCountry]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCountry];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCountry]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @ISO2 nvarchar(2),
    @ISO3 nvarchar(3),
    @NumericCode int,
    @Latitude decimal(10, 6),
    @Longitude decimal(10, 6),
    @BoundaryGeoJSON nvarchar(MAX),
    @CommonAliases nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Country]
    SET
        [Name] = @Name,
        [ISO2] = @ISO2,
        [ISO3] = @ISO3,
        [NumericCode] = @NumericCode,
        [Latitude] = @Latitude,
        [Longitude] = @Longitude,
        [BoundaryGeoJSON] = @BoundaryGeoJSON,
        [CommonAliases] = @CommonAliases
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCountries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCountries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCountry] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Country table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCountry]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCountry];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCountry
ON [${flyway:defaultSchema}].[Country]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Country]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Country] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Countries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCountry] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: spDeleteCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Country
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCountry]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCountry];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCountry]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Country]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCountry] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Countries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCountry] TO [cdp_Integration]



/* Index for Foreign Keys for EntityFieldValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityFieldID in table EntityFieldValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFieldValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID ON [${flyway:defaultSchema}].[EntityFieldValue] ([EntityFieldID]);

/* Base View Permissions SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: Permissions for vwEntityFieldValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFieldValues] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spCreateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldValue]
    @ID uniqueidentifier = NULL,
    @EntityFieldID uniqueidentifier,
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
            (
                [ID],
                [EntityFieldID],
                [Sequence],
                [Value],
                [Code],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityFieldID,
                @Sequence,
                @Value,
                @Code,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
            (
                [EntityFieldID],
                [Sequence],
                [Value],
                [Code],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityFieldID,
                @Sequence,
                @Value,
                @Code,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFieldValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for MJ: Entity Field Values */




/* spUpdate SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spUpdateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldValue]
    @ID uniqueidentifier,
    @EntityFieldID uniqueidentifier,
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldValue]
    SET
        [EntityFieldID] = @EntityFieldID,
        [Sequence] = @Sequence,
        [Value] = @Value,
        [Code] = @Code,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFieldValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFieldValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFieldValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityFieldValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityFieldValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityFieldValue
ON [${flyway:defaultSchema}].[EntityFieldValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityFieldValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entity Field Values */




/* spDelete SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spDeleteEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityFieldValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for MJ: Entity Field Values */




/* Index for Foreign Keys for RecordGeoCode */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table RecordGeoCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordGeoCode_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordGeoCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordGeoCode_EntityID ON [${flyway:defaultSchema}].[RecordGeoCode] ([EntityID]);

-- Index for foreign key CountryID in table RecordGeoCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordGeoCode_CountryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordGeoCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordGeoCode_CountryID ON [${flyway:defaultSchema}].[RecordGeoCode] ([CountryID]);

-- Index for foreign key StateProvinceID in table RecordGeoCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordGeoCode_StateProvinceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordGeoCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordGeoCode_StateProvinceID ON [${flyway:defaultSchema}].[RecordGeoCode] ([StateProvinceID]);

/* SQL text to update entity field related entity name field map for entity field ID 2174C80E-D364-4DBA-92F6-EEAADA410BD7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2174C80E-D364-4DBA-92F6-EEAADA410BD7', @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID 82F838DD-B57B-4AAD-AEF1-04E381E2971F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='82F838DD-B57B-4AAD-AEF1-04E381E2971F', @RelatedEntityNameFieldMap='Country'

/* SQL text to update entity field related entity name field map for entity field ID 73458121-BBFC-40FA-A093-D2B939839211 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='73458121-BBFC-40FA-A093-D2B939839211', @RelatedEntityNameFieldMap='StateProvince'

/* Base View SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: vwRecordGeoCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Geo Codes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordGeoCode
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecordGeoCodes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecordGeoCodes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordGeoCodes]
AS
SELECT
    r.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJCountry_CountryID.[Name] AS [Country],
    MJStateProvince_StateProvinceID.[Name] AS [StateProvince]
FROM
    [${flyway:defaultSchema}].[RecordGeoCode] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [r].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Country] AS MJCountry_CountryID
  ON
    [r].[CountryID] = MJCountry_CountryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[StateProvince] AS MJStateProvince_StateProvinceID
  ON
    [r].[StateProvinceID] = MJStateProvince_StateProvinceID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordGeoCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: Permissions for vwRecordGeoCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordGeoCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: spCreateRecordGeoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordGeoCode
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordGeoCode]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordGeoCode];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordGeoCode]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @LocationType nvarchar(50) = NULL,
    @Latitude decimal(10, 6),
    @Longitude decimal(10, 6),
    @Precision nvarchar(20),
    @CountryID uniqueidentifier,
    @StateProvinceID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @ErrorMessage nvarchar(MAX),
    @RetryCount int = NULL,
    @SourceFieldHash nvarchar(64),
    @GeocodedAt datetimeoffset,
    @GeocodingSource nvarchar(30)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordGeoCode]
            (
                [ID],
                [EntityID],
                [RecordID],
                [LocationType],
                [Latitude],
                [Longitude],
                [Precision],
                [CountryID],
                [StateProvinceID],
                [Status],
                [ErrorMessage],
                [RetryCount],
                [SourceFieldHash],
                [GeocodedAt],
                [GeocodingSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RecordID,
                ISNULL(@LocationType, 'Primary'),
                @Latitude,
                @Longitude,
                @Precision,
                @CountryID,
                @StateProvinceID,
                ISNULL(@Status, 'pending'),
                @ErrorMessage,
                ISNULL(@RetryCount, 0),
                @SourceFieldHash,
                @GeocodedAt,
                @GeocodingSource
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordGeoCode]
            (
                [EntityID],
                [RecordID],
                [LocationType],
                [Latitude],
                [Longitude],
                [Precision],
                [CountryID],
                [StateProvinceID],
                [Status],
                [ErrorMessage],
                [RetryCount],
                [SourceFieldHash],
                [GeocodedAt],
                [GeocodingSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RecordID,
                ISNULL(@LocationType, 'Primary'),
                @Latitude,
                @Longitude,
                @Precision,
                @CountryID,
                @StateProvinceID,
                ISNULL(@Status, 'pending'),
                @ErrorMessage,
                ISNULL(@RetryCount, 0),
                @SourceFieldHash,
                @GeocodedAt,
                @GeocodingSource
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordGeoCodes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordGeoCode] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Record Geo Codes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordGeoCode] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: spUpdateRecordGeoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordGeoCode
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordGeoCode]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordGeoCode];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordGeoCode]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @LocationType nvarchar(50),
    @Latitude decimal(10, 6),
    @Longitude decimal(10, 6),
    @Precision nvarchar(20),
    @CountryID uniqueidentifier,
    @StateProvinceID uniqueidentifier,
    @Status nvarchar(20),
    @ErrorMessage nvarchar(MAX),
    @RetryCount int,
    @SourceFieldHash nvarchar(64),
    @GeocodedAt datetimeoffset,
    @GeocodingSource nvarchar(30)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordGeoCode]
    SET
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [LocationType] = @LocationType,
        [Latitude] = @Latitude,
        [Longitude] = @Longitude,
        [Precision] = @Precision,
        [CountryID] = @CountryID,
        [StateProvinceID] = @StateProvinceID,
        [Status] = @Status,
        [ErrorMessage] = @ErrorMessage,
        [RetryCount] = @RetryCount,
        [SourceFieldHash] = @SourceFieldHash,
        [GeocodedAt] = @GeocodedAt,
        [GeocodingSource] = @GeocodingSource
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordGeoCodes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordGeoCodes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordGeoCode] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordGeoCode table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordGeoCode]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordGeoCode];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordGeoCode
ON [${flyway:defaultSchema}].[RecordGeoCode]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordGeoCode]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordGeoCode] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Record Geo Codes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordGeoCode] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: spDeleteRecordGeoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordGeoCode
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecordGeoCode]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordGeoCode];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordGeoCode]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordGeoCode]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordGeoCode] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Record Geo Codes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordGeoCode] TO [cdp_Integration]



/* Index for Foreign Keys for StateProvince */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CountryID in table StateProvince
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_StateProvince_CountryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[StateProvince]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_StateProvince_CountryID ON [${flyway:defaultSchema}].[StateProvince] ([CountryID]);

/* SQL text to update entity field related entity name field map for entity field ID 91BF2A06-1C23-46F9-8D79-A81015836573 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='91BF2A06-1C23-46F9-8D79-A81015836573', @RelatedEntityNameFieldMap='Country'

/* Base View SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: vwStateProvinces
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: State Provinces
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  StateProvince
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwStateProvinces]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwStateProvinces];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwStateProvinces]
AS
SELECT
    s.*,
    MJCountry_CountryID.[Name] AS [Country]
FROM
    [${flyway:defaultSchema}].[StateProvince] AS s
INNER JOIN
    [${flyway:defaultSchema}].[Country] AS MJCountry_CountryID
  ON
    [s].[CountryID] = MJCountry_CountryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwStateProvinces] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: Permissions for vwStateProvinces
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwStateProvinces] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: spCreateStateProvince
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR StateProvince
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateStateProvince]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateStateProvince];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateStateProvince]
    @ID uniqueidentifier = NULL,
    @CountryID uniqueidentifier,
    @Name nvarchar(200),
    @Code nvarchar(10),
    @ISO3166_2 nvarchar(10),
    @Latitude decimal(10, 6),
    @Longitude decimal(10, 6),
    @BoundaryGeoJSON nvarchar(MAX),
    @CommonAliases nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[StateProvince]
            (
                [ID],
                [CountryID],
                [Name],
                [Code],
                [ISO3166_2],
                [Latitude],
                [Longitude],
                [BoundaryGeoJSON],
                [CommonAliases]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CountryID,
                @Name,
                @Code,
                @ISO3166_2,
                @Latitude,
                @Longitude,
                @BoundaryGeoJSON,
                @CommonAliases
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[StateProvince]
            (
                [CountryID],
                [Name],
                [Code],
                [ISO3166_2],
                [Latitude],
                [Longitude],
                [BoundaryGeoJSON],
                [CommonAliases]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CountryID,
                @Name,
                @Code,
                @ISO3166_2,
                @Latitude,
                @Longitude,
                @BoundaryGeoJSON,
                @CommonAliases
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwStateProvinces] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateStateProvince] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: State Provinces */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateStateProvince] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: spUpdateStateProvince
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR StateProvince
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateStateProvince]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateStateProvince];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateStateProvince]
    @ID uniqueidentifier,
    @CountryID uniqueidentifier,
    @Name nvarchar(200),
    @Code nvarchar(10),
    @ISO3166_2 nvarchar(10),
    @Latitude decimal(10, 6),
    @Longitude decimal(10, 6),
    @BoundaryGeoJSON nvarchar(MAX),
    @CommonAliases nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[StateProvince]
    SET
        [CountryID] = @CountryID,
        [Name] = @Name,
        [Code] = @Code,
        [ISO3166_2] = @ISO3166_2,
        [Latitude] = @Latitude,
        [Longitude] = @Longitude,
        [BoundaryGeoJSON] = @BoundaryGeoJSON,
        [CommonAliases] = @CommonAliases
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwStateProvinces] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwStateProvinces]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateStateProvince] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the StateProvince table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateStateProvince]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateStateProvince];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateStateProvince
ON [${flyway:defaultSchema}].[StateProvince]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[StateProvince]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[StateProvince] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: State Provinces */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateStateProvince] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: spDeleteStateProvince
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR StateProvince
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteStateProvince]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteStateProvince];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteStateProvince]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[StateProvince]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteStateProvince] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: State Provinces */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteStateProvince] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '419bc535-b734-4b60-8fa6-ca0406b40463' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'Entity')) BEGIN
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
            '419bc535-b734-4b60-8fa6-ca0406b40463',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100035,
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd63ac51-ece5-44af-a737-8dd9398237f1' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'Country')) BEGIN
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
            'dd63ac51-ece5-44af-a737-8dd9398237f1',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100036,
            'Country',
            'Country',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e32baf2a-fb99-44f7-a9d3-1f437e44d2ae' OR (EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97' AND Name = 'StateProvince')) BEGIN
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
            'e32baf2a-fb99-44f7-a9d3-1f437e44d2ae',
            '54EF915A-9902-4958-8E09-AE6E7B525E97', -- Entity: MJ: Record Geo Codes
            100037,
            'StateProvince',
            'State Province',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '900a7d60-efc9-4174-b614-74ad4709962a' OR (EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336' AND Name = 'Country')) BEGIN
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
            '900a7d60-efc9-4174-b614-74ad4709962a',
            '12C21789-12CC-4A8C-81ED-FFCBC1D69336', -- Entity: MJ: State Provinces
            100023,
            'Country',
            'Country',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AD4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AE4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '419BC535-B734-4B60-8FA6-CA0406B40463'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'F51815BB-B7F2-476F-B0B4-8119EEEDE33B'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'F3E3AF4A-10E0-443A-A744-C6CD004C5C31'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F51815BB-B7F2-476F-B0B4-8119EEEDE33B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F3E3AF4A-10E0-443A-A744-C6CD004C5C31'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4CCD7FD8-7341-499F-B199-4D65D87203DB'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '32396F7D-F786-4612-BA91-78006867FC63'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '419BC535-B734-4B60-8FA6-CA0406B40463'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DD63AC51-ECE5-44AF-A737-8DD9398237F1'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E32BAF2A-FB99-44F7-A9D3-1F437E44D2AE'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F51815BB-B7F2-476F-B0B4-8119EEEDE33B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F3E3AF4A-10E0-443A-A744-C6CD004C5C31'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '419BC535-B734-4B60-8FA6-CA0406B40463'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DD63AC51-ECE5-44AF-A737-8DD9398237F1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E32BAF2A-FB99-44F7-A9D3-1F437E44D2AE'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '524E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '204F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '524E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1EC04F8E-5F7B-4D54-9CFA-3EDDECE50637'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3AE14F22-8E67-4428-A540-7210FD37D4F3'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AC735DFC-8A31-4450-A0BD-EB42DC50F4DD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1EC04F8E-5F7B-4D54-9CFA-3EDDECE50637'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3AE14F22-8E67-4428-A540-7210FD37D4F3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5C2D067E-8E65-4734-8AA6-D15A4616423F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '67B42824-236E-4D32-A44E-BA69B2675D85'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A32988C3-192D-4CC2-A84A-2080546BC47D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '900A7D60-EFC9-4174-B614-74AD4709962A'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '67B42824-236E-4D32-A44E-BA69B2675D85'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A32988C3-192D-4CC2-A84A-2080546BC47D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1614C4F0-7EC6-440B-835F-6A5D826E4EB8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '900A7D60-EFC9-4174-B614-74AD4709962A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2174C80E-D364-4DBA-92F6-EEAADA410BD7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Record',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F51815BB-B7F2-476F-B0B4-8119EEEDE33B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '419BC535-B734-4B60-8FA6-CA0406B40463' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.LocationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F3E3AF4A-10E0-443A-A744-C6CD004C5C31' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.SourceFieldHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B1B38354-D8A9-4079-A15F-8ECCFD558576' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.Latitude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Geo',
   CodeType = NULL
WHERE 
   ID = 'BAD1868E-5D5A-4287-AFCF-352C2A3E6699' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.Longitude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Geo',
   CodeType = NULL
WHERE 
   ID = 'EC46B3E9-73AB-48CD-B231-4D7312BADBBE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.Precision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4CCD7FD8-7341-499F-B199-4D65D87203DB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.CountryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Country',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82F838DD-B57B-4AAD-AEF1-04E381E2971F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.StateProvinceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'State Province',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73458121-BBFC-40FA-A093-D2B939839211' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.Country 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'Country Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD63AC51-ECE5-44AF-A737-8DD9398237F1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.StateProvince 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geocoding Results',
   GeneratedFormSection = 'Category',
   DisplayName = 'State Province Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E32BAF2A-FB99-44F7-A9D3-1F437E44D2AE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '32396F7D-F786-4612-BA91-78006867FC63' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.GeocodingSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BCA87CF8-5989-4A92-BA21-3B3B409401AB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.GeocodedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '46621B92-ADB4-4206-A660-2D93B634E7A4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.RetryCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4DAE2800-36FC-49C5-8D3E-64EAF15708A0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B5FE6B9-B64F-401B-AEF2-1613456109E5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '797360EF-109D-4A8F-B040-5B2141DB37C5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '04104288-E86F-4F22-A8CF-3A6AE181311E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Geo Codes.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '731BBA14-51FC-47DD-9240-62CB3EC58AF6' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-map-marked-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-map-marked-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '54EF915A-9902-4958-8E09-AE6E7B525E97'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('2aca268b-65ec-4042-b994-feff632b6ac3', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'FieldCategoryInfo', '{"Record Mapping":{"icon":"fa fa-link","description":"Information linking the geocode to its source entity and record"},"Geocoding Results":{"icon":"fa fa-map-marker-alt","description":"The resulting coordinates and geographic regional classifications"},"Processing Status":{"icon":"fa fa-sync","description":"Technical status, error logs, and metadata for the geocoding process"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3d5f5205-de54-499d-9d7e-c0e44841db6e', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'FieldCategoryIcons', '{"Record Mapping":"fa fa-link","Geocoding Results":"fa fa-map-marker-alt","Processing Status":"fa fa-sync","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '54EF915A-9902-4958-8E09-AE6E7B525E97'
      

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: State Provinces.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D152568A-2ADE-444C-B90D-25E0EA572E5D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.CountryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Administrative Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Country',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91BF2A06-1C23-46F9-8D79-A81015836573' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Administrative Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '22834F17-39BF-4B4F-BB12-AC82B5D27812' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.Code 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Administrative Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'State Code',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '67B42824-236E-4D32-A44E-BA69B2675D85' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.ISO3166_2 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Administrative Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'ISO 3166-2 Code',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A32988C3-192D-4CC2-A84A-2080546BC47D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.Country 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Administrative Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Country Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '900A7D60-EFC9-4174-B614-74AD4709962A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.Latitude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geospatial Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Geo',
   CodeType = NULL
WHERE 
   ID = 'F53E01C8-6574-4AE2-9BCE-6B4872E4E768' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.Longitude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geospatial Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Geo',
   CodeType = NULL
WHERE 
   ID = '69D0FB57-2826-4DB9-A4F9-8F5F1EAE68A1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.BoundaryGeoJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geospatial Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Boundary GeoJSON',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '1E447AFD-91E9-4D6B-9EC7-D1A55B82145B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.CommonAliases 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geospatial Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '1614C4F0-7EC6-440B-835F-6A5D826E4EB8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DCE8DADC-F9FF-4CF7-BB42-5E361DD4A582' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: State Provinces.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E6C31E8-D3AB-478B-8A5E-639A60CA0FD1' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-map */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-map', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('94b1acee-2f0b-4e01-a0a9-2b1c5dbcb7f8', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', 'FieldCategoryInfo', '{"Administrative Details":{"icon":"fa fa-id-card","description":"Core identification, names, and standardized codes for the administrative division."},"Geospatial Information":{"icon":"fa fa-globe-americas","description":"Coordinates, boundary data, and aliases used for mapping and geographic resolution."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('eff0ea3f-936c-4aa9-acc9-984cef72a06f', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', 'FieldCategoryIcons', '{"Administrative Details":"fa fa-id-card","Geospatial Information":"fa fa-globe-americas","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '12C21789-12CC-4A8C-81ED-FFCBC1D69336'
      

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Countries.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C45F5A7D-AB58-482E-9A71-1997F54736C4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Country Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF0E4EDF-1D03-40D5-BFAC-659FEA2D4047' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.ISO2 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Country Identification',
   GeneratedFormSection = 'Category',
   DisplayName = 'ISO 2',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1EC04F8E-5F7B-4D54-9CFA-3EDDECE50637' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.ISO3 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Country Identification',
   GeneratedFormSection = 'Category',
   DisplayName = 'ISO 3',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3AE14F22-8E67-4428-A540-7210FD37D4F3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.NumericCode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Country Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC735DFC-8A31-4450-A0BD-EB42DC50F4DD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.CommonAliases 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Country Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5C2D067E-8E65-4734-8AA6-D15A4616423F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.Latitude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geographic Data',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Geo',
   CodeType = NULL
WHERE 
   ID = 'E9DE72D2-0320-42D6-B367-512EA1FB6A61' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.Longitude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geographic Data',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Geo',
   CodeType = NULL
WHERE 
   ID = 'D0B9CD33-3B5D-48D5-9E0C-979D906A89A7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.BoundaryGeoJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Geographic Data',
   GeneratedFormSection = 'Category',
   DisplayName = 'Boundary GeoJSON',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '16649F72-2BC6-4849-9F04-ED5152AF4973' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2FAB840E-B124-4DA6-8B93-83E04E1CCEC5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Countries.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '547F24F8-8693-44AA-94A3-46D9D920B538' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-globe-americas */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-globe-americas', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ebb4fc21-b341-4f6a-b5fe-a1a15e73e8af', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', 'FieldCategoryInfo', '{"Country Identification":{"icon":"fa fa-id-card","description":"Official names, standard ISO codes, and common aliases used to identify countries."},"Geographic Data":{"icon":"fa fa-map-marked-alt","description":"Centroid coordinates and spatial boundary data for mapping and geocoding."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and technical identifiers."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('17d67c26-f2f6-4b83-a0be-d5e6226a2174', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', 'FieldCategoryIcons', '{"Country Identification":"fa fa-id-card","Geographic Data":"fa fa-map-marked-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2'
      

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwApplicationEntities';
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntityFieldValues';

