/*
 * Trailbloom - MJ_Biking_App Sample Data
 * 1000 records with distribution:
 *   - 30% road/outdoor biking
 *   - 20% urban/city biking
 *   - 50% other types (mountain, gravel, mixed)
 */

USE [YourDatabaseName]; -- Replace with your database name
GO

-- ============================================================================
-- RIDERS (100 riders)
-- ============================================================================

-- Create temp table for rider generation
DECLARE @i INT = 1;
DECLARE @rider_id UNIQUEIDENTIFIER;
DECLARE @terrain NVARCHAR(20);
DECLARE @fitness INT;
DECLARE @weight DECIMAL(5,2);

WHILE @i <= 100
BEGIN
    SET @rider_id = NEWID();
    SET @fitness = (ABS(CHECKSUM(NEWID())) % 10) + 1;
    SET @weight = 50.0 + (ABS(CHECKSUM(NEWID())) % 600) / 10.0;

    -- Distribution: 30% road, 20% urban, 50% other
    SET @terrain = CASE
        WHEN @i <= 30 THEN 'road'
        WHEN @i <= 50 THEN 'urban'
        WHEN @i <= 65 THEN 'mountain'
        WHEN @i <= 80 THEN 'gravel'
        ELSE 'mixed'
    END;

    INSERT INTO [MJ_Biking_App].[Rider]
        ([rider_id], [username], [email], [weight_kg], [fitness_level], [preferred_terrain], [lifetime_stats])
    VALUES (
        @rider_id,
        CONCAT('rider_', FORMAT(@i, '000')),
        CONCAT('rider', @i, '@trailbloom.com'),
        @weight,
        @fitness,
        @terrain,
        JSON_QUERY(CONCAT('{"total_rides":', (ABS(CHECKSUM(NEWID())) % 500) + 10,
            ',"total_km":', (ABS(CHECKSUM(NEWID())) % 10000) + 100, '}'))
    );

    SET @i = @i + 1;
END;
GO

-- ============================================================================
-- BIKES (200 bikes, ~2 per rider)
-- ============================================================================

INSERT INTO [MJ_Biking_App].[Bike] ([rider_id], [name], [bike_type], [weight_kg], [wheel_size_in], [total_distance_m], [last_serviced])
SELECT
    r.[rider_id],
    CONCAT(
        CASE (ABS(CHECKSUM(NEWID())) % 8)
            WHEN 0 THEN 'Trek '
            WHEN 1 THEN 'Specialized '
            WHEN 2 THEN 'Giant '
            WHEN 3 THEN 'Cannondale '
            WHEN 4 THEN 'Scott '
            WHEN 5 THEN 'Canyon '
            WHEN 6 THEN 'Cervelo '
            ELSE 'Pinarello '
        END,
        CASE bike_type
            WHEN 'road' THEN 'Domane'
            WHEN 'mountain' THEN 'Stumpjumper'
            WHEN 'gravel' THEN 'Diverge'
            WHEN 'hybrid' THEN 'Sirrus'
            WHEN 'electric' THEN 'Turbo'
            WHEN 'touring' THEN 'AWOL'
            WHEN 'cyclocross' THEN 'SuperX'
            ELSE 'Podium'
        END
    ) AS [name],
    bike_type,
    CASE bike_type
        WHEN 'road' THEN 7.0 + (ABS(CHECKSUM(NEWID())) % 30) / 10.0
        WHEN 'mountain' THEN 11.0 + (ABS(CHECKSUM(NEWID())) % 50) / 10.0
        WHEN 'electric' THEN 18.0 + (ABS(CHECKSUM(NEWID())) % 80) / 10.0
        ELSE 9.0 + (ABS(CHECKSUM(NEWID())) % 40) / 10.0
    END AS [weight_kg],
    CASE bike_type
        WHEN 'road' THEN 28.00
        WHEN 'mountain' THEN 29.00
        WHEN 'bmx' THEN 20.00
        ELSE 27.50
    END AS [wheel_size_in],
    CAST((ABS(CHECKSUM(NEWID())) % 50000) + 1000 AS DECIMAL(12,2)) * 100 AS [total_distance_m],
    DATEADD(DAY, -(ABS(CHECKSUM(NEWID())) % 365), GETUTCDATE()) AS [last_serviced]
FROM [MJ_Biking_App].[Rider] r
CROSS APPLY (
    SELECT TOP 2 bike_type
    FROM (VALUES
        -- 30% road
        ('road'), ('road'), ('road'),
        -- 20% urban (hybrid/electric)
        ('hybrid'), ('electric'),
        -- 50% other
        ('mountain'), ('gravel'), ('touring'), ('cyclocross'), ('bmx')
    ) AS types(bike_type)
    ORDER BY NEWID()
) AS bt;
GO

-- ============================================================================
-- LOCATIONS (200 locations) - Real SF Bay Area Cycling Locations
-- ============================================================================

-- First, insert 20 well-known Bay Area cycling locations with exact coordinates
INSERT INTO [MJ_Biking_App].[Location]
    ([rider_id], [name], [latitude], [longitude], [elevation_m], [terrain_type], [surface_condition], [difficulty_rating], [visit_count])
SELECT
    (SELECT TOP 1 rider_id FROM [MJ_Biking_App].[Rider] ORDER BY NEWID()),
    loc.[name], loc.[latitude], loc.[longitude], loc.[elevation_m], loc.[terrain_type], loc.[surface_condition], loc.[difficulty_rating], loc.[visit_count]
FROM (VALUES
    -- Famous Marin County Climbs & Trails
    ('Hawk Hill Summit', 37.8267, -122.4985, 284, 'road', 'dry', 7.5, 156),
    ('Mt. Tamalpais East Peak', 37.9235, -122.5965, 784, 'mountain', 'packed', 8.5, 134),
    ('Marin Headlands Loop', 37.8352, -122.5267, 245, 'road', 'dry', 6.5, 112),
    ('China Camp Village Trail', 37.9985, -122.4678, 85, 'singletrack', 'packed', 5.5, 98),
    ('Paradise Loop', 37.9195, -122.4845, 15, 'road', 'dry', 4.0, 89),
    ('Tamarancho Flow Trail', 38.0124, -122.5734, 320, 'singletrack', 'loose', 7.0, 67),
    ('Camino Alto', 37.9082, -122.5234, 195, 'road', 'dry', 6.0, 78),

    -- San Francisco
    ('SF Embarcadero', 37.7955, -122.3933, 3, 'urban', 'dry', 2.0, 128),
    ('Golden Gate Park', 37.7694, -122.4862, 45, 'urban', 'dry', 2.5, 145),
    ('Twin Peaks Climb', 37.7544, -122.4477, 282, 'road', 'dry', 7.0, 62),
    ('Presidio Trails', 37.7989, -122.4662, 85, 'paved_trail', 'dry', 3.5, 95),

    -- East Bay
    ('Mt. Diablo Summit', 37.8816, -121.9142, 1173, 'mountain', 'dry', 9.0, 76),
    ('Redwood Regional Park', 37.8128, -122.1456, 425, 'singletrack', 'packed', 5.0, 58),
    ('Joaquin Miller Park', 37.8124, -122.1892, 365, 'singletrack', 'loose', 5.5, 45),
    ('Coyote Hills Regional', 37.5548, -122.0876, 45, 'gravel', 'packed', 3.0, 58),

    -- Peninsula & South Bay
    ('Old La Honda Road', 37.3648, -122.2175, 425, 'road', 'dry', 7.0, 82),
    ('Skyline Ridge', 37.3125, -122.1654, 792, 'gravel', 'packed', 6.0, 48),
    ('Stevens Creek Trail', 37.3228, -122.0456, 125, 'paved_trail', 'dry', 2.0, 92),
    ('Pacifica Coastal Trail', 37.6138, -122.4869, 95, 'paved_trail', 'dry', 4.5, 54),

    -- Wine Country
    ('Annadel State Park', 38.4352, -122.6234, 385, 'singletrack', 'loose', 6.5, 43)
) AS loc([name], [latitude], [longitude], [elevation_m], [terrain_type], [surface_condition], [difficulty_rating], [visit_count]);

-- Generate 180 more locations based on real Bay Area cycling areas
INSERT INTO [MJ_Biking_App].[Location]
    ([rider_id], [name], [latitude], [longitude], [elevation_m], [terrain_type], [surface_condition], [difficulty_rating], [visit_count])
SELECT TOP 180
    r.[rider_id],
    CONCAT(
        CASE (ABS(CHECKSUM(NEWID())) % 20)
            WHEN 0 THEN 'Bolinas Ridge'
            WHEN 1 THEN 'Panoramic Highway'
            WHEN 2 THEN 'Lucas Valley'
            WHEN 3 THEN 'Sir Francis Drake'
            WHEN 4 THEN 'Nicasio Valley'
            WHEN 5 THEN 'Shoreline Trail'
            WHEN 6 THEN 'Bay Trail'
            WHEN 7 THEN 'Coastal Trail'
            WHEN 8 THEN 'Sawyer Camp'
            WHEN 9 THEN 'Cañada Road'
            WHEN 10 THEN 'Kings Mountain'
            WHEN 11 THEN 'Page Mill Road'
            WHEN 12 THEN 'Montebello Ridge'
            WHEN 13 THEN 'Los Gatos Creek'
            WHEN 14 THEN 'Guadalupe Trail'
            WHEN 15 THEN 'Morgan Territory'
            WHEN 16 THEN 'Mines Road'
            WHEN 17 THEN 'Palomares Road'
            WHEN 18 THEN 'Niles Canyon'
            ELSE 'Sunol Regional'
        END,
        ' - Section ', (ABS(CHECKSUM(NEWID())) % 15) + 1
    ) AS [name],
    -- Real Bay Area latitude range (37.2 to 38.5)
    CAST(37.2 + (ABS(CHECKSUM(NEWID())) % 130) / 100.0 AS DECIMAL(9,6)) AS [latitude],
    -- Real Bay Area longitude range (-122.7 to -121.8)
    CAST(-122.7 + (ABS(CHECKSUM(NEWID())) % 90) / 100.0 AS DECIMAL(9,6)) AS [longitude],
    CAST((ABS(CHECKSUM(NEWID())) % 1200) AS DECIMAL(7,2)) AS [elevation_m],
    -- Terrain distribution: 30% road, 20% urban, 50% other
    CASE
        WHEN ROW_NUMBER() OVER (ORDER BY NEWID()) % 10 <= 2 THEN 'road'
        WHEN ROW_NUMBER() OVER (ORDER BY NEWID()) % 10 <= 4 THEN 'urban'
        WHEN ROW_NUMBER() OVER (ORDER BY NEWID()) % 10 <= 5 THEN 'singletrack'
        WHEN ROW_NUMBER() OVER (ORDER BY NEWID()) % 10 <= 6 THEN 'doubletrack'
        WHEN ROW_NUMBER() OVER (ORDER BY NEWID()) % 10 <= 7 THEN 'gravel'
        WHEN ROW_NUMBER() OVER (ORDER BY NEWID()) % 10 <= 8 THEN 'paved_trail'
        ELSE 'mountain'
    END AS [terrain_type],
    CASE (ABS(CHECKSUM(NEWID())) % 7)
        WHEN 0 THEN 'dry'
        WHEN 1 THEN 'wet'
        WHEN 2 THEN 'packed'
        WHEN 3 THEN 'loose'
        WHEN 4 THEN 'muddy'
        WHEN 5 THEN 'sandy'
        ELSE 'dry'
    END AS [surface_condition],
    CAST(1.0 + (ABS(CHECKSUM(NEWID())) % 90) / 10.0 AS DECIMAL(3,1)) AS [difficulty_rating],
    (ABS(CHECKSUM(NEWID())) % 80) + 5 AS [visit_count]
FROM [MJ_Biking_App].[Rider] r
CROSS JOIN (SELECT TOP 2 1 AS n FROM sys.objects) AS multiplier;
GO

-- ============================================================================
-- WEATHER (300 weather snapshots)
-- ============================================================================

INSERT INTO [MJ_Biking_App].[Weather]
    ([location_id], [temperature_c], [humidity_pct], [wind_speed_mps], [wind_direction_deg],
     [precipitation_type], [cloud_cover_pct], [visibility_km], [observed_at])
SELECT TOP 300
    l.[location_id],
    CAST(-5.0 + (ABS(CHECKSUM(NEWID())) % 400) / 10.0 AS DECIMAL(5,2)) AS [temperature_c],
    CAST((ABS(CHECKSUM(NEWID())) % 1000) / 10.0 AS DECIMAL(5,2)) AS [humidity_pct],
    CAST((ABS(CHECKSUM(NEWID())) % 200) / 10.0 AS DECIMAL(6,2)) AS [wind_speed_mps],
    CAST((ABS(CHECKSUM(NEWID())) % 3600) / 10.0 AS DECIMAL(5,2)) AS [wind_direction_deg],
    CASE (ABS(CHECKSUM(NEWID())) % 8)
        WHEN 0 THEN 'none'
        WHEN 1 THEN 'none'
        WHEN 2 THEN 'none'
        WHEN 3 THEN 'drizzle'
        WHEN 4 THEN 'rain'
        WHEN 5 THEN 'fog'
        WHEN 6 THEN 'none'
        ELSE 'none'
    END AS [precipitation_type],
    (ABS(CHECKSUM(NEWID())) % 101) AS [cloud_cover_pct],
    CAST(5.0 + (ABS(CHECKSUM(NEWID())) % 950) / 10.0 AS DECIMAL(6,2)) AS [visibility_km],
    DATEADD(HOUR, -(ABS(CHECKSUM(NEWID())) % 8760), GETUTCDATE()) AS [observed_at]
FROM [MJ_Biking_App].[Location] l
CROSS JOIN (SELECT TOP 2 1 AS n FROM sys.objects) AS multiplier
ORDER BY NEWID();
GO

-- ============================================================================
-- RIDER_STATS (500 ride sessions) - Main data with distribution
-- ============================================================================

-- First batch: Road/Outdoor biking (150 records = 30%)
INSERT INTO [MJ_Biking_App].[Rider_Stats]
    ([rider_id], [location_id], [bike_id], [avg_speed_mps], [max_speed_mps],
     [avg_heart_rate_bpm], [max_heart_rate_bpm], [cadence_rpm], [power_watts],
     [distance_m], [elevation_gain_m], [duration_seconds], [calories_burned], [effort_rating])
SELECT TOP 150
    r.[rider_id],
    l.[location_id],
    b.[bike_id],
    -- Road biking: higher speeds (8-12 m/s = 29-43 km/h)
    CAST(8.0 + (ABS(CHECKSUM(NEWID())) % 40) / 10.0 AS DECIMAL(6,2)) AS [avg_speed_mps],
    CAST(12.0 + (ABS(CHECKSUM(NEWID())) % 60) / 10.0 AS DECIMAL(6,2)) AS [max_speed_mps],
    130 + (ABS(CHECKSUM(NEWID())) % 40) AS [avg_heart_rate_bpm],
    160 + (ABS(CHECKSUM(NEWID())) % 30) AS [max_heart_rate_bpm],
    80 + (ABS(CHECKSUM(NEWID())) % 30) AS [cadence_rpm],
    150 + (ABS(CHECKSUM(NEWID())) % 150) AS [power_watts],
    CAST((20000 + (ABS(CHECKSUM(NEWID())) % 80000)) AS DECIMAL(12,2)) AS [distance_m],
    CAST((100 + (ABS(CHECKSUM(NEWID())) % 900)) AS DECIMAL(8,2)) AS [elevation_gain_m],
    1800 + (ABS(CHECKSUM(NEWID())) % 7200) AS [duration_seconds],
    300 + (ABS(CHECKSUM(NEWID())) % 1200) AS [calories_burned],
    5 + (ABS(CHECKSUM(NEWID())) % 5) AS [effort_rating]
FROM [MJ_Biking_App].[Rider] r
INNER JOIN [MJ_Biking_App].[Location] l ON l.[rider_id] = r.[rider_id]
INNER JOIN [MJ_Biking_App].[Bike] b ON b.[rider_id] = r.[rider_id] AND b.[bike_type] = 'road'
WHERE r.[preferred_terrain] = 'road'
ORDER BY NEWID();
GO

-- Second batch: Urban/City biking (100 records = 20%)
INSERT INTO [MJ_Biking_App].[Rider_Stats]
    ([rider_id], [location_id], [bike_id], [avg_speed_mps], [max_speed_mps],
     [avg_heart_rate_bpm], [max_heart_rate_bpm], [cadence_rpm], [power_watts],
     [distance_m], [elevation_gain_m], [duration_seconds], [calories_burned], [effort_rating])
SELECT TOP 100
    r.[rider_id],
    l.[location_id],
    b.[bike_id],
    -- Urban biking: moderate speeds (4-7 m/s = 14-25 km/h)
    CAST(4.0 + (ABS(CHECKSUM(NEWID())) % 30) / 10.0 AS DECIMAL(6,2)) AS [avg_speed_mps],
    CAST(7.0 + (ABS(CHECKSUM(NEWID())) % 40) / 10.0 AS DECIMAL(6,2)) AS [max_speed_mps],
    100 + (ABS(CHECKSUM(NEWID())) % 40) AS [avg_heart_rate_bpm],
    130 + (ABS(CHECKSUM(NEWID())) % 40) AS [max_heart_rate_bpm],
    60 + (ABS(CHECKSUM(NEWID())) % 30) AS [cadence_rpm],
    80 + (ABS(CHECKSUM(NEWID())) % 100) AS [power_watts],
    CAST((5000 + (ABS(CHECKSUM(NEWID())) % 20000)) AS DECIMAL(12,2)) AS [distance_m],
    CAST((10 + (ABS(CHECKSUM(NEWID())) % 200)) AS DECIMAL(8,2)) AS [elevation_gain_m],
    900 + (ABS(CHECKSUM(NEWID())) % 3600) AS [duration_seconds],
    100 + (ABS(CHECKSUM(NEWID())) % 500) AS [calories_burned],
    2 + (ABS(CHECKSUM(NEWID())) % 5) AS [effort_rating]
FROM [MJ_Biking_App].[Rider] r
INNER JOIN [MJ_Biking_App].[Location] l ON l.[rider_id] = r.[rider_id]
INNER JOIN [MJ_Biking_App].[Bike] b ON b.[rider_id] = r.[rider_id] AND b.[bike_type] IN ('hybrid', 'electric')
WHERE r.[preferred_terrain] = 'urban'
ORDER BY NEWID();
GO

-- Third batch: Mountain biking (100 records = 20%)
INSERT INTO [MJ_Biking_App].[Rider_Stats]
    ([rider_id], [location_id], [bike_id], [avg_speed_mps], [max_speed_mps],
     [avg_heart_rate_bpm], [max_heart_rate_bpm], [cadence_rpm], [power_watts],
     [distance_m], [elevation_gain_m], [duration_seconds], [calories_burned], [effort_rating])
SELECT TOP 100
    r.[rider_id],
    l.[location_id],
    b.[bike_id],
    -- Mountain biking: variable speeds (3-6 m/s), high effort
    CAST(3.0 + (ABS(CHECKSUM(NEWID())) % 30) / 10.0 AS DECIMAL(6,2)) AS [avg_speed_mps],
    CAST(8.0 + (ABS(CHECKSUM(NEWID())) % 50) / 10.0 AS DECIMAL(6,2)) AS [max_speed_mps],
    140 + (ABS(CHECKSUM(NEWID())) % 30) AS [avg_heart_rate_bpm],
    170 + (ABS(CHECKSUM(NEWID())) % 25) AS [max_heart_rate_bpm],
    50 + (ABS(CHECKSUM(NEWID())) % 40) AS [cadence_rpm],
    200 + (ABS(CHECKSUM(NEWID())) % 200) AS [power_watts],
    CAST((10000 + (ABS(CHECKSUM(NEWID())) % 30000)) AS DECIMAL(12,2)) AS [distance_m],
    CAST((300 + (ABS(CHECKSUM(NEWID())) % 1500)) AS DECIMAL(8,2)) AS [elevation_gain_m],
    2400 + (ABS(CHECKSUM(NEWID())) % 5400) AS [duration_seconds],
    500 + (ABS(CHECKSUM(NEWID())) % 1000) AS [calories_burned],
    6 + (ABS(CHECKSUM(NEWID())) % 4) AS [effort_rating]
FROM [MJ_Biking_App].[Rider] r
INNER JOIN [MJ_Biking_App].[Location] l ON l.[rider_id] = r.[rider_id]
INNER JOIN [MJ_Biking_App].[Bike] b ON b.[rider_id] = r.[rider_id] AND b.[bike_type] = 'mountain'
WHERE r.[preferred_terrain] = 'mountain'
ORDER BY NEWID();
GO

-- Fourth batch: Gravel biking (75 records = 15%)
INSERT INTO [MJ_Biking_App].[Rider_Stats]
    ([rider_id], [location_id], [bike_id], [avg_speed_mps], [max_speed_mps],
     [avg_heart_rate_bpm], [max_heart_rate_bpm], [cadence_rpm], [power_watts],
     [distance_m], [elevation_gain_m], [duration_seconds], [calories_burned], [effort_rating])
SELECT TOP 75
    r.[rider_id],
    l.[location_id],
    b.[bike_id],
    -- Gravel: medium speeds (5-8 m/s)
    CAST(5.0 + (ABS(CHECKSUM(NEWID())) % 30) / 10.0 AS DECIMAL(6,2)) AS [avg_speed_mps],
    CAST(9.0 + (ABS(CHECKSUM(NEWID())) % 40) / 10.0 AS DECIMAL(6,2)) AS [max_speed_mps],
    125 + (ABS(CHECKSUM(NEWID())) % 35) AS [avg_heart_rate_bpm],
    155 + (ABS(CHECKSUM(NEWID())) % 35) AS [max_heart_rate_bpm],
    70 + (ABS(CHECKSUM(NEWID())) % 25) AS [cadence_rpm],
    140 + (ABS(CHECKSUM(NEWID())) % 140) AS [power_watts],
    CAST((15000 + (ABS(CHECKSUM(NEWID())) % 50000)) AS DECIMAL(12,2)) AS [distance_m],
    CAST((200 + (ABS(CHECKSUM(NEWID())) % 800)) AS DECIMAL(8,2)) AS [elevation_gain_m],
    2100 + (ABS(CHECKSUM(NEWID())) % 6300) AS [duration_seconds],
    400 + (ABS(CHECKSUM(NEWID())) % 800) AS [calories_burned],
    5 + (ABS(CHECKSUM(NEWID())) % 4) AS [effort_rating]
FROM [MJ_Biking_App].[Rider] r
INNER JOIN [MJ_Biking_App].[Location] l ON l.[rider_id] = r.[rider_id]
INNER JOIN [MJ_Biking_App].[Bike] b ON b.[rider_id] = r.[rider_id] AND b.[bike_type] = 'gravel'
WHERE r.[preferred_terrain] = 'gravel'
ORDER BY NEWID();
GO

-- Fifth batch: Mixed/Touring (75 records = 15%)
INSERT INTO [MJ_Biking_App].[Rider_Stats]
    ([rider_id], [location_id], [bike_id], [avg_speed_mps], [max_speed_mps],
     [avg_heart_rate_bpm], [max_heart_rate_bpm], [cadence_rpm], [power_watts],
     [distance_m], [elevation_gain_m], [duration_seconds], [calories_burned], [effort_rating])
SELECT TOP 75
    r.[rider_id],
    l.[location_id],
    b.[bike_id],
    -- Touring: steady moderate speeds (4-6 m/s), long distances
    CAST(4.0 + (ABS(CHECKSUM(NEWID())) % 20) / 10.0 AS DECIMAL(6,2)) AS [avg_speed_mps],
    CAST(6.0 + (ABS(CHECKSUM(NEWID())) % 30) / 10.0 AS DECIMAL(6,2)) AS [max_speed_mps],
    110 + (ABS(CHECKSUM(NEWID())) % 30) AS [avg_heart_rate_bpm],
    140 + (ABS(CHECKSUM(NEWID())) % 30) AS [max_heart_rate_bpm],
    65 + (ABS(CHECKSUM(NEWID())) % 25) AS [cadence_rpm],
    100 + (ABS(CHECKSUM(NEWID())) % 120) AS [power_watts],
    CAST((30000 + (ABS(CHECKSUM(NEWID())) % 100000)) AS DECIMAL(12,2)) AS [distance_m],
    CAST((150 + (ABS(CHECKSUM(NEWID())) % 600)) AS DECIMAL(8,2)) AS [elevation_gain_m],
    3600 + (ABS(CHECKSUM(NEWID())) % 14400) AS [duration_seconds],
    600 + (ABS(CHECKSUM(NEWID())) % 1400) AS [calories_burned],
    4 + (ABS(CHECKSUM(NEWID())) % 4) AS [effort_rating]
FROM [MJ_Biking_App].[Rider] r
INNER JOIN [MJ_Biking_App].[Location] l ON l.[rider_id] = r.[rider_id]
INNER JOIN [MJ_Biking_App].[Bike] b ON b.[rider_id] = r.[rider_id] AND b.[bike_type] IN ('touring', 'cyclocross')
WHERE r.[preferred_terrain] = 'mixed'
ORDER BY NEWID();
GO

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'Record Counts by Table' AS [Report];
SELECT 'Riders' AS [Table], COUNT(*) AS [Count] FROM [MJ_Biking_App].[Rider]
UNION ALL
SELECT 'Bikes', COUNT(*) FROM [MJ_Biking_App].[Bike]
UNION ALL
SELECT 'Locations', COUNT(*) FROM [MJ_Biking_App].[Location]
UNION ALL
SELECT 'Weather', COUNT(*) FROM [MJ_Biking_App].[Weather]
UNION ALL
SELECT 'Rider_Stats', COUNT(*) FROM [MJ_Biking_App].[Rider_Stats];

SELECT 'Rider Distribution by Terrain' AS [Report];
SELECT [preferred_terrain], COUNT(*) AS [Count],
       CAST(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM [MJ_Biking_App].[Rider]) AS DECIMAL(5,1)) AS [Percentage]
FROM [MJ_Biking_App].[Rider]
GROUP BY [preferred_terrain]
ORDER BY [Count] DESC;

SELECT 'Bike Distribution by Type' AS [Report];
SELECT [bike_type], COUNT(*) AS [Count],
       CAST(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM [MJ_Biking_App].[Bike]) AS DECIMAL(5,1)) AS [Percentage]
FROM [MJ_Biking_App].[Bike]
GROUP BY [bike_type]
ORDER BY [Count] DESC;

PRINT '============================================================================';
PRINT 'Sample data generation complete!';
PRINT 'Distribution: 30% road, 20% urban, 50% other (mountain/gravel/mixed)';
PRINT '============================================================================';
GO
