
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