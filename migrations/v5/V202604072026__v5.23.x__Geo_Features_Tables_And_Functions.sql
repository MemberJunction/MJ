-- Migration: Geo Features — Reference Tables, RecordGeoCode, SQL Functions, Entity Metadata
-- Description: Phase 1 foundation for universal geo mapping capabilities in MemberJunction.
--              Creates Country and StateProvince reference tables, RecordGeoCode polymorphic
--              geocoding results table, Haversine distance scalar function, radius query TVF,
--              and adds SupportsGeoCoding / AutoUpdateSupportsGeoCoding to Entity table and
--              AutoUpdateExtendedType to EntityField table.

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


-- ============================================================================
-- ALTER Entity: Add SupportsGeoCoding and AutoUpdateSupportsGeoCoding columns
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.Entity
ADD SupportsGeoCoding BIT NOT NULL DEFAULT 0,
    AutoUpdateSupportsGeoCoding BIT NOT NULL DEFAULT 1;

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true, CodeGen generates geo-aware subclass code, adds __mj_Latitude/__mj_Longitude virtual fields to the base view, and the UI shows a map view toggle. Auto-set by CodeGen when LLM detects geo-capable fields (address, lat/lng, etc.).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Entity',
    @level2type=N'COLUMN', @level2name=N'SupportsGeoCoding';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true (default), CodeGen can automatically set SupportsGeoCoding based on LLM analysis of entity fields. Set to 0 to lock the value and prevent CodeGen from changing it.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Entity',
    @level2type=N'COLUMN', @level2name=N'AutoUpdateSupportsGeoCoding';


-- ============================================================================
-- ALTER EntityField: Add AutoUpdateExtendedType column + update ExtendedType CHECK constraint
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.EntityField
ADD AutoUpdateExtendedType BIT NOT NULL DEFAULT 1;

-- Update the CHECK constraint to include new Geo* ExtendedType values
ALTER TABLE ${flyway:defaultSchema}.EntityField DROP CONSTRAINT CK_EntityField_ExtendedType;
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD CONSTRAINT CK_EntityField_ExtendedType CHECK (
    ExtendedType IN ('Code', 'Email', 'FaceTime', 'Geo', 'GeoLatitude', 'GeoLongitude', 'GeoCountry', 'GeoStateProvince', 'GeoCity', 'GeoPostalCode', 'GeoAddress', 'MSTeams', 'Other', 'SIP', 'SMS', 'Skype', 'Tel', 'URL', 'WhatsApp', 'ZoomMtg')
);

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true (default), CodeGen can automatically suggest and apply ExtendedType values (GeoLatitude, GeoLongitude, GeoAddress, etc.) during LLM field categorization. Set to 0 to lock admin-specified ExtendedType.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityField',
    @level2type=N'COLUMN', @level2name=N'AutoUpdateExtendedType';


-- ============================================================================
-- Note: SQL functions (fn_MJ_GeoDistance, fn_MJ_GeoRecordsNear) require GO
-- batch separators for CREATE FUNCTION statements. Since Skyway processes
-- migrations within transactions that don't support GO, these functions are
-- created via dynamic SQL using EXEC() which runs each as a self-contained batch.
-- ============================================================================

-- Function: fn_MJ_GeoDistance (Scalar — Haversine formula)
-- Returns the great-circle distance between two lat/lng points.
-- Unit: 'mi' for miles, 'km' for kilometers.
DECLARE @GeoDistSQL NVARCHAR(MAX) = N'
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
    DECLARE @R FLOAT = CASE WHEN @Unit = ''km'' THEN 6371.0 ELSE 3959.0 END;
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
END';
EXEC(@GeoDistSQL);

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Calculates great-circle distance between two geographic points using the Haversine formula. Returns distance in miles (unit="mi") or kilometers (unit="km"). Baseline MJ geo infrastructure.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'FUNCTION', @level1name=N'fn_MJ_GeoDistance';


-- Function: fn_MJ_GeoRecordsNear (Inline Table-Valued Function)
-- Returns RecordGeoCode rows within a given radius of a center point.
-- Uses bounding box pre-filter for index usage, then Haversine for precision.
DECLARE @GeoNearSQL NVARCHAR(MAX) = N'
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
            @Radius / (CASE WHEN @Unit = ''km'' THEN 111.0 ELSE 69.0 END) AS LatDelta,
            @Radius / (CASE WHEN @Unit = ''km'' THEN 111.0 ELSE 69.0 END
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
      AND rgc.Status = ''success''
      AND rgc.Latitude IS NOT NULL
      AND rgc.Longitude IS NOT NULL
      AND rgc.Latitude  BETWEEN @CenterLat - bb.LatDelta AND @CenterLat + bb.LatDelta
      AND rgc.Longitude BETWEEN @CenterLng - bb.LngDelta AND @CenterLng + bb.LngDelta
      AND ${flyway:defaultSchema}.fn_MJ_GeoDistance(
              rgc.Latitude, rgc.Longitude,
              @CenterLat, @CenterLng,
              @Unit
          ) <= @Radius
)';
EXEC(@GeoNearSQL);

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Inline table-valued function that returns RecordGeoCode rows within a given radius of a center point. Uses bounding box pre-filter for index utilization, then Haversine for precision. Takes Entity Name (unique string) for readability. Baseline MJ geo infrastructure.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'FUNCTION', @level1name=N'fn_MJ_GeoRecordsNear';


















































-- ================================================================
-- CODEGEN OUTPUT
-- Auto-generated by MJ CodeGen. Do not manually edit below this line.
-- This includes: views, stored procedures, entity metadata, field
-- metadata, permissions, and other generated database objects for
-- the Country, StateProvince, and RecordGeoCode entities, plus
-- updated Entity and EntityField metadata for new columns.
-- Appended on: 2026-04-07
-- ================================================================
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
         'fa590c2b-ac93-4705-b77f-e29199f18b2b',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'fa590c2b-ac93-4705-b77f-e29199f18b2b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Countries for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fa590c2b-ac93-4705-b77f-e29199f18b2b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Countries for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fa590c2b-ac93-4705-b77f-e29199f18b2b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Countries for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fa590c2b-ac93-4705-b77f-e29199f18b2b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         '3532d81d-9f69-4e5f-8c08-0e5612e0ec84',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3532d81d-9f69-4e5f-8c08-0e5612e0ec84', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: State Provinces for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3532d81d-9f69-4e5f-8c08-0e5612e0ec84', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: State Provinces for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3532d81d-9f69-4e5f-8c08-0e5612e0ec84', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: State Provinces for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3532d81d-9f69-4e5f-8c08-0e5612e0ec84', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         'c1f5719c-3545-41f5-a99e-b8497b50279b',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c1f5719c-3545-41f5-a99e-b8497b50279b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Record Geo Codes for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c1f5719c-3545-41f5-a99e-b8497b50279b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Record Geo Codes for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c1f5719c-3545-41f5-a99e-b8497b50279b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Record Geo Codes for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c1f5719c-3545-41f5-a99e-b8497b50279b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.StateProvince */
UPDATE [${flyway:defaultSchema}].[StateProvince] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ADD CONSTRAINT [DF___mj_StateProvince___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.StateProvince */
UPDATE [${flyway:defaultSchema}].[StateProvince] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.StateProvince */
ALTER TABLE [${flyway:defaultSchema}].[StateProvince] ADD CONSTRAINT [DF___mj_StateProvince___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
UPDATE [${flyway:defaultSchema}].[RecordGeoCode] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ADD CONSTRAINT [DF___mj_RecordGeoCode___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
UPDATE [${flyway:defaultSchema}].[RecordGeoCode] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordGeoCode */
ALTER TABLE [${flyway:defaultSchema}].[RecordGeoCode] ADD CONSTRAINT [DF___mj_RecordGeoCode___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Country */
UPDATE [${flyway:defaultSchema}].[Country] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ADD CONSTRAINT [DF___mj_Country___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Country */
UPDATE [${flyway:defaultSchema}].[Country] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Country */
ALTER TABLE [${flyway:defaultSchema}].[Country] ADD CONSTRAINT [DF___mj_Country___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e122e0d-cebd-4e4a-bcff-a9218aa6dc52' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = 'ID')) BEGIN
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
            '4e122e0d-cebd-4e4a-bcff-a9218aa6dc52',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39404160-26bf-43cc-96bb-7c44d77112f9' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = 'CountryID')) BEGIN
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
            '39404160-26bf-43cc-96bb-7c44d77112f9',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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
            'FA590C2B-AC93-4705-B77F-E29199F18B2B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd00bb1fc-b852-4fdf-8b80-1189f6f1955c' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = 'Name')) BEGIN
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
            'd00bb1fc-b852-4fdf-8b80-1189f6f1955c',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f87d7ef9-5da3-477e-8737-3d92fb239418' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = 'Code')) BEGIN
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
            'f87d7ef9-5da3-477e-8737-3d92fb239418',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1063afa6-4bc5-4401-8a1b-cd16ea61ac16' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = 'ISO3166_2')) BEGIN
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
            '1063afa6-4bc5-4401-8a1b-cd16ea61ac16',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73be71e9-bdbf-4718-b66b-eea8bc7416d7' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = 'Latitude')) BEGIN
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
            '73be71e9-bdbf-4718-b66b-eea8bc7416d7',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '788a8200-303e-4ac3-b718-d15bf686a245' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = 'Longitude')) BEGIN
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
            '788a8200-303e-4ac3-b718-d15bf686a245',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e789ba5e-ba34-4d8d-b5d9-76dfe1335bdb' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = 'BoundaryGeoJSON')) BEGIN
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
            'e789ba5e-ba34-4d8d-b5d9-76dfe1335bdb',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8e3f19b-806f-4f59-b24a-3f18c51dc1a6' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = 'CommonAliases')) BEGIN
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
            'b8e3f19b-806f-4f59-b24a-3f18c51dc1a6',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2ee0e3b3-f786-4d5d-b948-cecdd2072a09' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = '__mj_CreatedAt')) BEGIN
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
            '2ee0e3b3-f786-4d5d-b948-cecdd2072a09',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ff623ea-64bc-4381-aabd-9989dc3ac67b' OR (EntityID = '3532D81D-9F69-4E5F-8C08-0E5612E0EC84' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '7ff623ea-64bc-4381-aabd-9989dc3ac67b',
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', -- Entity: MJ: State Provinces
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74fd4a57-66ad-4e7a-95e1-6181b8a8a9d5' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateExtendedType')) BEGIN
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
            '74fd4a57-66ad-4e7a-95e1-6181b8a8a9d5',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Fields
            100133,
            'AutoUpdateExtendedType',
            'Auto Update Extended Type',
            'When true (default), CodeGen can automatically suggest and apply ExtendedType values (GeoLatitude, GeoLongitude, GeoAddress, etc.) during LLM field categorization. Set to 0 to lock admin-specified ExtendedType.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '323e1914-aef1-4a6e-908b-2ca0376933f4' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SupportsGeoCoding')) BEGIN
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
            '323e1914-aef1-4a6e-908b-2ca0376933f4',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100125,
            'SupportsGeoCoding',
            'Supports Geo Coding',
            'When true, CodeGen generates geo-aware subclass code, adds ${flyway:defaultSchema}_Latitude/${flyway:defaultSchema}_Longitude virtual fields to the base view, and the UI shows a map view toggle. Auto-set by CodeGen when LLM detects geo-capable fields (address, lat/lng, etc.).',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5ac48a3-b0be-4d33-b702-0421886b116a' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateSupportsGeoCoding')) BEGIN
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
            'e5ac48a3-b0be-4d33-b702-0421886b116a',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100126,
            'AutoUpdateSupportsGeoCoding',
            'Auto Update Supports Geo Coding',
            'When true (default), CodeGen can automatically set SupportsGeoCoding based on LLM analysis of entity fields. Set to 0 to lock the value and prevent CodeGen from changing it.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '940da78d-40cf-4d2b-b01a-08872f05fe8f' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'ID')) BEGIN
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
            '940da78d-40cf-4d2b-b01a-08872f05fe8f',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80b13af6-7a9c-4357-9b28-de17273105da' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'EntityID')) BEGIN
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
            '80b13af6-7a9c-4357-9b28-de17273105da',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eeab97a2-d639-4a76-a016-c23b352e82ab' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'RecordID')) BEGIN
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
            'eeab97a2-d639-4a76-a016-c23b352e82ab',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '680300a6-31e0-43e3-a328-465e7a041801' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'LocationType')) BEGIN
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
            '680300a6-31e0-43e3-a328-465e7a041801',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f7f00e3-2d99-4eea-b0ab-8e475511ea1f' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'Latitude')) BEGIN
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
            '6f7f00e3-2d99-4eea-b0ab-8e475511ea1f',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '76b9122b-4892-4f9f-8509-5b76efc7beaf' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'Longitude')) BEGIN
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
            '76b9122b-4892-4f9f-8509-5b76efc7beaf',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd833416b-295b-4d37-99a8-a51b972b36dd' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'Precision')) BEGIN
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
            'd833416b-295b-4d37-99a8-a51b972b36dd',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87afa08f-7884-4a02-a60c-f8c3925e73eb' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'CountryID')) BEGIN
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
            '87afa08f-7884-4a02-a60c-f8c3925e73eb',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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
            'FA590C2B-AC93-4705-B77F-E29199F18B2B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff275a36-0084-4833-a9be-3c15f79c9fc2' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'StateProvinceID')) BEGIN
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
            'ff275a36-0084-4833-a9be-3c15f79c9fc2',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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
            '3532D81D-9F69-4E5F-8C08-0E5612E0EC84',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '28ec2154-1a69-4eda-b27b-ccf22899d1de' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'Status')) BEGIN
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
            '28ec2154-1a69-4eda-b27b-ccf22899d1de',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c64890cc-e01f-4d25-9ba3-056c32078605' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'ErrorMessage')) BEGIN
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
            'c64890cc-e01f-4d25-9ba3-056c32078605',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '293f1a7c-3d11-4c48-9fec-7b2d39646693' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'RetryCount')) BEGIN
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
            '293f1a7c-3d11-4c48-9fec-7b2d39646693',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7dc337d1-3aa2-45aa-bf8e-81ab60686783' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'SourceFieldHash')) BEGIN
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
            '7dc337d1-3aa2-45aa-bf8e-81ab60686783',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5988729-8ed4-4f23-8f09-5d27508d0dfa' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'GeocodedAt')) BEGIN
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
            'a5988729-8ed4-4f23-8f09-5d27508d0dfa',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'da098a87-ace1-450f-a552-06f276a9ba70' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = 'GeocodingSource')) BEGIN
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
            'da098a87-ace1-450f-a552-06f276a9ba70',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2086c872-dc3f-4008-8645-5c27b4b45e1f' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = '__mj_CreatedAt')) BEGIN
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
            '2086c872-dc3f-4008-8645-5c27b4b45e1f',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b06ac02d-e218-4b19-b105-86eb56a9071e' OR (EntityID = 'C1F5719C-3545-41F5-A99E-B8497B50279B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'b06ac02d-e218-4b19-b105-86eb56a9071e',
            'C1F5719C-3545-41F5-A99E-B8497B50279B', -- Entity: MJ: Record Geo Codes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50ebd8b7-3396-49d3-b99c-e8936a69f8cf' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = 'ID')) BEGIN
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
            '50ebd8b7-3396-49d3-b99c-e8936a69f8cf',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '392ebbf7-ba6f-4a22-80bb-23b55860476d' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = 'Name')) BEGIN
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
            '392ebbf7-ba6f-4a22-80bb-23b55860476d',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2a05a69-5588-4b17-8759-c84f9619ba69' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = 'ISO2')) BEGIN
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
            'f2a05a69-5588-4b17-8759-c84f9619ba69',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37db373f-4804-40d9-a453-70ceb99f2057' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = 'ISO3')) BEGIN
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
            '37db373f-4804-40d9-a453-70ceb99f2057',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bc83d44-6dee-474e-9b91-32cfac4a02dd' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = 'NumericCode')) BEGIN
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
            '8bc83d44-6dee-474e-9b91-32cfac4a02dd',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '99c6ab05-ca29-4152-85e7-b5b4796d9a90' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = 'Latitude')) BEGIN
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
            '99c6ab05-ca29-4152-85e7-b5b4796d9a90',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f28aefd3-49b0-43c1-9954-508310eb91a1' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = 'Longitude')) BEGIN
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
            'f28aefd3-49b0-43c1-9954-508310eb91a1',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '33d12898-aef1-40f1-b5e1-aaa080c7716b' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = 'BoundaryGeoJSON')) BEGIN
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
            '33d12898-aef1-40f1-b5e1-aaa080c7716b',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b418cfea-ae3a-494d-9f59-e2d511098754' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = 'CommonAliases')) BEGIN
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
            'b418cfea-ae3a-494d-9f59-e2d511098754',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97c534bb-0d12-4bc2-8c40-a2039b377abd' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = '__mj_CreatedAt')) BEGIN
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
            '97c534bb-0d12-4bc2-8c40-a2039b377abd',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '354e90a5-333a-42ae-b8b4-b5c9ff916d0d' OR (EntityID = 'FA590C2B-AC93-4705-B77F-E29199F18B2B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '354e90a5-333a-42ae-b8b4-b5c9ff916d0d',
            'FA590C2B-AC93-4705-B77F-E29199F18B2B', -- Entity: MJ: Countries
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

/* SQL text to insert entity field value with ID df9ec577-0330-4c67-889e-d53ac35510df */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('df9ec577-0330-4c67-889e-d53ac35510df', 'D833416B-295B-4D37-99A8-A51B972B36DD', 1, 'city', 'city', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID f9b61e52-263d-4ac9-912a-2619a10c9105 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f9b61e52-263d-4ac9-912a-2619a10c9105', 'D833416B-295B-4D37-99A8-A51B972B36DD', 2, 'country', 'country', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID afc6bafc-564e-4983-9109-b3779a88950b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('afc6bafc-564e-4983-9109-b3779a88950b', 'D833416B-295B-4D37-99A8-A51B972B36DD', 3, 'county', 'county', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 3bb927aa-65a4-47d7-b78a-d4cb819a17d2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3bb927aa-65a4-47d7-b78a-d4cb819a17d2', 'D833416B-295B-4D37-99A8-A51B972B36DD', 4, 'exact', 'exact', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID b5562532-9407-4ea3-9dca-4431f66e365f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b5562532-9407-4ea3-9dca-4431f66e365f', 'D833416B-295B-4D37-99A8-A51B972B36DD', 5, 'postal_code', 'postal_code', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID bfaad537-a684-441e-aafa-1ab4c3c188ec */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bfaad537-a684-441e-aafa-1ab4c3c188ec', 'D833416B-295B-4D37-99A8-A51B972B36DD', 6, 'state_province', 'state_province', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID D833416B-295B-4D37-99A8-A51B972B36DD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D833416B-295B-4D37-99A8-A51B972B36DD'

/* SQL text to insert entity field value with ID e113498e-07c1-4cad-ab3c-3580e657bd54 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e113498e-07c1-4cad-ab3c-3580e657bd54', '28EC2154-1A69-4EDA-B27B-CCF22899D1DE', 1, 'failed', 'failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID fb2e5b1a-ad5d-4c60-afd2-0a73d0585c06 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fb2e5b1a-ad5d-4c60-afd2-0a73d0585c06', '28EC2154-1A69-4EDA-B27B-CCF22899D1DE', 2, 'pending', 'pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID a68a4402-c46c-4024-a845-4b246627950c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a68a4402-c46c-4024-a845-4b246627950c', '28EC2154-1A69-4EDA-B27B-CCF22899D1DE', 3, 'success', 'success', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 28EC2154-1A69-4EDA-B27B-CCF22899D1DE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='28EC2154-1A69-4EDA-B27B-CCF22899D1DE'

/* SQL text to insert entity field value with ID 98a7f852-a482-4992-9daf-e0ad89dae605 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('98a7f852-a482-4992-9daf-e0ad89dae605', 'DA098A87-ACE1-450F-A552-06F276A9BA70', 1, 'google', 'google', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ead6b823-259d-42e7-afca-a79d3bb1577f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ead6b823-259d-42e7-afca-a79d3bb1577f', 'DA098A87-ACE1-450F-A552-06F276A9BA70', 2, 'ip_geolocation', 'ip_geolocation', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 32ff613b-aff3-41b9-82ff-8b8ec667bf86 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('32ff613b-aff3-41b9-82ff-8b8ec667bf86', 'DA098A87-ACE1-450F-A552-06F276A9BA70', 3, 'manual', 'manual', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 04718486-5761-4417-ba84-df2399da5303 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('04718486-5761-4417-ba84-df2399da5303', 'DA098A87-ACE1-450F-A552-06F276A9BA70', 4, 'native', 'native', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID deeab784-fe17-487c-b1ed-f0ffd64d057b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('deeab784-fe17-487c-b1ed-f0ffd64d057b', 'DA098A87-ACE1-450F-A552-06F276A9BA70', 5, 'reference_data', 'reference_data', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 38e38abc-37d5-484f-b247-28f93bf8a4f9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('38e38abc-37d5-484f-b247-28f93bf8a4f9', 'DA098A87-ACE1-450F-A552-06F276A9BA70', 6, 'reverse', 'reverse', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID DA098A87-ACE1-450F-A552-06F276A9BA70 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='DA098A87-ACE1-450F-A552-06F276A9BA70'


/* Create Entity Relationship: MJ: State Provinces -> MJ: Record Geo Codes (One To Many via StateProvinceID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0958885b-74ac-42df-8f4e-5d3c6548e990'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0958885b-74ac-42df-8f4e-5d3c6548e990', '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', 'C1F5719C-3545-41F5-A99E-B8497B50279B', 'StateProvinceID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Record Geo Codes (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e1904a9b-26ab-441a-994f-b13a21a83c09'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e1904a9b-26ab-441a-994f-b13a21a83c09', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C1F5719C-3545-41F5-A99E-B8497B50279B', 'EntityID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Countries -> MJ: State Provinces (One To Many via CountryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ca8832fc-67d5-4dc1-a59e-5772ab9c6824'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ca8832fc-67d5-4dc1-a59e-5772ab9c6824', 'FA590C2B-AC93-4705-B77F-E29199F18B2B', '3532D81D-9F69-4E5F-8C08-0E5612E0EC84', 'CountryID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Countries -> MJ: Record Geo Codes (One To Many via CountryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2f49f786-995c-458d-a3e9-578075ac38cc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2f49f786-995c-458d-a3e9-578075ac38cc', 'FA590C2B-AC93-4705-B77F-E29199F18B2B', 'C1F5719C-3545-41F5-A99E-B8497B50279B', 'CountryID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    

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



/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

/* Base View Permissions SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25) = NULL,
    @DisplayName nvarchar(255),
    @AllowMultipleSubtypes bit = NULL,
    @SupportsGeoCoding bit = NULL,
    @AutoUpdateSupportsGeoCoding bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ID],
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @NameSuffix,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @FullTextCatalog,
                ISNULL(@FullTextCatalogGenerated, 1),
                @FullTextIndex,
                ISNULL(@FullTextIndexGenerated, 1),
                @FullTextSearchFunction,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                @UserViewMaxRows,
                @spCreate,
                @spUpdate,
                @spDelete,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                @spMatch,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                @EntityObjectSubclassName,
                @EntityObjectSubclassImport,
                @PreferredCommunicationField,
                @Icon,
                @ScopeDefault,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                @RowsToPackSampleOrder,
                @AutoRowCountFrequency,
                @RowCount,
                @RowCountRunAt,
                ISNULL(@Status, 'Active'),
                @DisplayName,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @NameSuffix,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @FullTextCatalog,
                ISNULL(@FullTextCatalogGenerated, 1),
                @FullTextIndex,
                ISNULL(@FullTextIndexGenerated, 1),
                @FullTextSearchFunction,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                @UserViewMaxRows,
                @spCreate,
                @spUpdate,
                @spDelete,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                @spMatch,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                @EntityObjectSubclassName,
                @EntityObjectSubclassImport,
                @PreferredCommunicationField,
                @Icon,
                @ScopeDefault,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                @RowsToPackSampleOrder,
                @AutoRowCountFrequency,
                @RowCount,
                @RowCountRunAt,
                ISNULL(@Status, 'Active'),
                @DisplayName,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25),
    @DisplayName nvarchar(255),
    @AllowMultipleSubtypes bit,
    @SupportsGeoCoding bit,
    @AutoUpdateSupportsGeoCoding bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [DeleteType] = @DeleteType,
        [AllowRecordMerge] = @AllowRecordMerge,
        [spMatch] = @spMatch,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon,
        [ScopeDefault] = @ScopeDefault,
        [RowsToPackWithSchema] = @RowsToPackWithSchema,
        [RowsToPackSampleMethod] = @RowsToPackSampleMethod,
        [RowsToPackSampleCount] = @RowsToPackSampleCount,
        [RowsToPackSampleOrder] = @RowsToPackSampleOrder,
        [AutoRowCountFrequency] = @AutoRowCountFrequency,
        [RowCount] = @RowCount,
        [RowCountRunAt] = @RowCountRunAt,
        [Status] = @Status,
        [DisplayName] = @DisplayName,
        [AllowMultipleSubtypes] = @AllowMultipleSubtypes,
        [SupportsGeoCoding] = @SupportsGeoCoding,
        [AutoUpdateSupportsGeoCoding] = @AutoUpdateSupportsGeoCoding
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [${flyway:defaultSchema}].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [${flyway:defaultSchema}].[EntityField] ([RelatedEntityID]);

-- Index for foreign key EncryptionKeyID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID ON [${flyway:defaultSchema}].[EntityField] ([EncryptionKeyID]);

/* Base View Permissions SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @ID uniqueidentifier = NULL,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category nvarchar(255),
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit = NULL,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL,
    @IsSoftPrimaryKey bit = NULL,
    @IsSoftForeignKey bit = NULL,
    @RelatedEntityJoinFields nvarchar(MAX),
    @JSONType nvarchar(255),
    @JSONTypeIsArray bit = NULL,
    @JSONTypeDefinition nvarchar(MAX),
    @AutoUpdateExtendedType bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [ID],
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields],
                [JSONType],
                [JSONTypeIsArray],
                [JSONTypeDefinition],
                [AutoUpdateExtendedType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields,
                @JSONType,
                ISNULL(@JSONTypeIsArray, 0),
                @JSONTypeDefinition,
                ISNULL(@AutoUpdateExtendedType, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields],
                [JSONType],
                [JSONTypeIsArray],
                [JSONTypeDefinition],
                [AutoUpdateExtendedType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields,
                @JSONType,
                ISNULL(@JSONTypeIsArray, 0),
                @JSONTypeDefinition,
                ISNULL(@AutoUpdateExtendedType, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10),
    @Status nvarchar(25),
    @AutoUpdateIsNameField bit,
    @AutoUpdateDefaultInView bit,
    @AutoUpdateCategory bit,
    @AutoUpdateDisplayName bit,
    @AutoUpdateIncludeInUserSearchAPI bit,
    @Encrypt bit,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit,
    @SendEncryptedValue bit,
    @IsSoftPrimaryKey bit,
    @IsSoftForeignKey bit,
    @RelatedEntityJoinFields nvarchar(MAX),
    @JSONType nvarchar(255),
    @JSONTypeIsArray bit,
    @JSONTypeDefinition nvarchar(MAX),
    @AutoUpdateExtendedType bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema,
        [Status] = @Status,
        [AutoUpdateIsNameField] = @AutoUpdateIsNameField,
        [AutoUpdateDefaultInView] = @AutoUpdateDefaultInView,
        [AutoUpdateCategory] = @AutoUpdateCategory,
        [AutoUpdateDisplayName] = @AutoUpdateDisplayName,
        [AutoUpdateIncludeInUserSearchAPI] = @AutoUpdateIncludeInUserSearchAPI,
        [Encrypt] = @Encrypt,
        [EncryptionKeyID] = @EncryptionKeyID,
        [AllowDecryptInAPI] = @AllowDecryptInAPI,
        [SendEncryptedValue] = @SendEncryptedValue,
        [IsSoftPrimaryKey] = @IsSoftPrimaryKey,
        [IsSoftForeignKey] = @IsSoftForeignKey,
        [RelatedEntityJoinFields] = @RelatedEntityJoinFields,
        [JSONType] = @JSONType,
        [JSONTypeIsArray] = @JSONTypeIsArray,
        [JSONTypeDefinition] = @JSONTypeDefinition,
        [AutoUpdateExtendedType] = @AutoUpdateExtendedType
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityField
ON [${flyway:defaultSchema}].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



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

/* SQL text to update entity field related entity name field map for entity field ID 80B13AF6-7A9C-4357-9B28-DE17273105DA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='80B13AF6-7A9C-4357-9B28-DE17273105DA', @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID 87AFA08F-7884-4A02-A60C-F8C3925E73EB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='87AFA08F-7884-4A02-A60C-F8C3925E73EB', @RelatedEntityNameFieldMap='Country'

/* SQL text to update entity field related entity name field map for entity field ID FF275A36-0084-4833-A9BE-3C15F79C9FC2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FF275A36-0084-4833-A9BE-3C15F79C9FC2', @RelatedEntityNameFieldMap='StateProvince'

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

/* SQL text to update entity field related entity name field map for entity field ID 39404160-26BF-43CC-96BB-7C44D77112F9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='39404160-26BF-43CC-96BB-7C44D77112F9', @RelatedEntityNameFieldMap='Country'

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



/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntities';
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntityFields';

