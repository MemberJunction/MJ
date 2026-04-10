-- ============================================================================
-- PostgreSQL variants of the geo SQL functions originally created for
-- SQL Server in V202604072026__v5.23.x__Geo_Features_Tables_And_Functions.sql
--
-- Contains:
--   1. fn_MJ_GeoDistance      - Scalar Haversine distance function
--   2. fn_MJ_GeoRecordsNear  - Set-returning radius query function
--
-- This migration only runs on PostgreSQL databases.
-- ============================================================================

-- Guard: skip entirely when running on SQL Server (or any non-PostgreSQL engine)
DO $guard$
BEGIN
    -- pg_catalog.pg_class is a PostgreSQL-only system catalog table.
    -- If we reach this block we are on PostgreSQL; nothing to skip.
    -- On SQL Server this whole file would fail at the DO $$ block syntax
    -- level, but as an extra safety net we check current_setting.
    IF current_setting('server_version_num')::int < 100000 THEN
        RAISE NOTICE 'PostgreSQL version too old for this migration (need 10+). Skipping.';
        RETURN;
    END IF;
END
$guard$;

-- ============================================================================
-- Function 1: fn_MJ_GeoDistance
--
-- Calculates the great-circle distance between two geographic points using
-- the Haversine formula.
--
-- Parameters:
--   p_lat1  - Latitude of point 1  (decimal degrees)
--   p_lng1  - Longitude of point 1 (decimal degrees)
--   p_lat2  - Latitude of point 2  (decimal degrees)
--   p_lng2  - Longitude of point 2 (decimal degrees)
--   p_unit  - 'mi' for miles, 'km' for kilometers
--
-- Returns: distance as DOUBLE PRECISION (NULL if any coordinate is NULL)
-- ============================================================================
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_MJ_GeoDistance(
    p_lat1  NUMERIC(10,6),
    p_lng1  NUMERIC(10,6),
    p_lat2  NUMERIC(10,6),
    p_lng2  NUMERIC(10,6),
    p_unit  VARCHAR(2)
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
    v_R          DOUBLE PRECISION;
    v_lat1_rad   DOUBLE PRECISION;
    v_lat2_rad   DOUBLE PRECISION;
    v_delta_lat  DOUBLE PRECISION;
    v_delta_lng  DOUBLE PRECISION;
    v_a          DOUBLE PRECISION;
    v_c          DOUBLE PRECISION;
BEGIN
    -- Return NULL if any coordinate is missing
    IF p_lat1 IS NULL OR p_lng1 IS NULL OR p_lat2 IS NULL OR p_lng2 IS NULL THEN
        RETURN NULL;
    END IF;

    -- Earth radius: 6371 km or 3959 mi
    v_R := CASE WHEN p_unit = 'km' THEN 6371.0 ELSE 3959.0 END;

    v_lat1_rad  := RADIANS(p_lat1::DOUBLE PRECISION);
    v_lat2_rad  := RADIANS(p_lat2::DOUBLE PRECISION);
    v_delta_lat := RADIANS((p_lat2 - p_lat1)::DOUBLE PRECISION);
    v_delta_lng := RADIANS((p_lng2 - p_lng1)::DOUBLE PRECISION);

    -- Haversine formula
    v_a := SIN(v_delta_lat / 2.0) * SIN(v_delta_lat / 2.0)
         + COS(v_lat1_rad) * COS(v_lat2_rad)
         * SIN(v_delta_lng / 2.0) * SIN(v_delta_lng / 2.0);

    v_c := 2.0 * ATAN2(SQRT(v_a), SQRT(1.0 - v_a));

    RETURN v_R * v_c;
END;
$$;

COMMENT ON FUNCTION ${flyway:defaultSchema}.fn_MJ_GeoDistance(NUMERIC, NUMERIC, NUMERIC, NUMERIC, VARCHAR)
    IS 'Calculates great-circle distance between two geographic points using the Haversine formula. Returns distance in miles (unit=''mi'') or kilometers (unit=''km''). PostgreSQL variant of the SQL Server fn_MJ_GeoDistance. Baseline MJ geo infrastructure.';


-- ============================================================================
-- Function 2: fn_MJ_GeoRecordsNear
--
-- Returns RecordGeoCode rows within a given radius of a center point.
-- Uses a bounding-box pre-filter for index utilization, then applies the
-- Haversine formula for precise distance filtering.
--
-- Parameters:
--   p_entity_name - Name of the entity (matched against Entity.Name)
--   p_center_lat  - Center latitude  (decimal degrees)
--   p_center_lng  - Center longitude (decimal degrees)
--   p_radius      - Search radius
--   p_unit        - 'mi' for miles, 'km' for kilometers
--
-- Returns: set of rows with RecordGeoCode columns plus a Distance column
-- ============================================================================
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_MJ_GeoRecordsNear(
    p_entity_name  VARCHAR(500),
    p_center_lat   NUMERIC(10,6),
    p_center_lng   NUMERIC(10,6),
    p_radius       DOUBLE PRECISION,
    p_unit         VARCHAR(2)
)
RETURNS TABLE (
    "ID"              UUID,
    "EntityID"        UUID,
    "RecordID"        VARCHAR(750),
    "LocationType"    VARCHAR(50),
    "Latitude"        NUMERIC(10,6),
    "Longitude"       NUMERIC(10,6),
    "Precision"       VARCHAR(50),
    "CountryID"       UUID,
    "StateProvinceID" UUID,
    "Status"          VARCHAR(50),
    "GeocodingSource" VARCHAR(200),
    "Distance"        DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
    v_lat_delta DOUBLE PRECISION;
    v_lng_delta DOUBLE PRECISION;
    v_deg_per_unit DOUBLE PRECISION;
BEGIN
    -- Approximate degrees-per-distance-unit for the bounding box.
    -- 1 degree latitude ~ 69 miles ~ 111 km
    v_deg_per_unit := CASE WHEN p_unit = 'km' THEN 111.0 ELSE 69.0 END;

    v_lat_delta := p_radius / v_deg_per_unit;
    v_lng_delta := p_radius / (v_deg_per_unit * COS(RADIANS(p_center_lat::DOUBLE PRECISION)));

    RETURN QUERY
    SELECT
        rgc."ID",
        rgc."EntityID",
        rgc."RecordID",
        rgc."LocationType",
        rgc."Latitude",
        rgc."Longitude",
        rgc."Precision",
        rgc."CountryID",
        rgc."StateProvinceID",
        rgc."Status",
        rgc."GeocodingSource",
        ${flyway:defaultSchema}.fn_MJ_GeoDistance(
            rgc."Latitude", rgc."Longitude",
            p_center_lat, p_center_lng,
            p_unit
        ) AS "Distance"
    FROM ${flyway:defaultSchema}."RecordGeoCode" rgc
    INNER JOIN ${flyway:defaultSchema}."Entity" e ON e."ID" = rgc."EntityID"
    WHERE e."Name" = p_entity_name
      AND rgc."Status" = 'success'
      AND rgc."Latitude"  IS NOT NULL
      AND rgc."Longitude" IS NOT NULL
      -- Bounding box pre-filter (uses indexes)
      AND rgc."Latitude"  BETWEEN p_center_lat - v_lat_delta AND p_center_lat + v_lat_delta
      AND rgc."Longitude" BETWEEN p_center_lng - v_lng_delta AND p_center_lng + v_lng_delta
      -- Precise Haversine filter
      AND ${flyway:defaultSchema}.fn_MJ_GeoDistance(
              rgc."Latitude", rgc."Longitude",
              p_center_lat, p_center_lng,
              p_unit
          ) <= p_radius;
END;
$$;

COMMENT ON FUNCTION ${flyway:defaultSchema}.fn_MJ_GeoRecordsNear(VARCHAR, NUMERIC, NUMERIC, DOUBLE PRECISION, VARCHAR)
    IS 'Set-returning function that returns RecordGeoCode rows within a given radius of a center point. Uses bounding box pre-filter for index utilization, then Haversine for precision. PostgreSQL variant of the SQL Server fn_MJ_GeoRecordsNear. Baseline MJ geo infrastructure.';
