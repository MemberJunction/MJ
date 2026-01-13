/*
 * Trailbloom - MJ_Biking_App Database Schema
 *
 * An outdoor cycling app that tracks rides and grows a personal
 * digital ecosystem based on cycling behavior.
 *
 * Created: 2026-01-13
 */

-- ============================================================================
-- SCHEMA CREATION
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'MJ_Biking_App')
BEGIN
    EXEC('CREATE SCHEMA [MJ_Biking_App]');
END
GO

-- ============================================================================
-- TABLE: Rider
-- Stores cyclist profile information and preferences
-- ============================================================================

CREATE TABLE [MJ_Biking_App].[Rider] (
    [rider_id]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [username]          NVARCHAR(50)     NOT NULL,
    [email]             NVARCHAR(255)    NOT NULL,
    [weight_kg]         DECIMAL(5,2)     NULL,
    [fitness_level]     INT              NULL,
    [preferred_terrain] NVARCHAR(20)     NULL,
    [lifetime_stats]    NVARCHAR(MAX)    NULL,
    [created_at]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [PK_Rider] PRIMARY KEY CLUSTERED ([rider_id]),
    CONSTRAINT [UQ_Rider_username] UNIQUE ([username]),
    CONSTRAINT [UQ_Rider_email] UNIQUE ([email]),

    -- Value range constraints
    CONSTRAINT [CK_Rider_weight_kg] CHECK ([weight_kg] IS NULL OR ([weight_kg] >= 0 AND [weight_kg] <= 300)),
    CONSTRAINT [CK_Rider_fitness_level] CHECK ([fitness_level] IS NULL OR ([fitness_level] >= 1 AND [fitness_level] <= 10)),

    -- Enum constraint for preferred_terrain
    CONSTRAINT [CK_Rider_preferred_terrain] CHECK (
        [preferred_terrain] IS NULL OR
        [preferred_terrain] IN ('road', 'gravel', 'mountain', 'urban', 'mixed')
    ),

    -- JSON validation constraint
    CONSTRAINT [CK_Rider_lifetime_stats_json] CHECK ([lifetime_stats] IS NULL OR ISJSON([lifetime_stats]) = 1)
);
GO

-- Extended properties for Rider table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores cyclist profile information and preferences for the Trailbloom app',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App',
    @level1type = N'TABLE',  @level1name = N'Rider';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the rider',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider', @level2type = N'COLUMN', @level2name = N'rider_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique username for the rider account',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider', @level2type = N'COLUMN', @level2name = N'username';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Email address for the rider account',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider', @level2type = N'COLUMN', @level2name = N'email';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rider body weight in kilograms (0-300)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider', @level2type = N'COLUMN', @level2name = N'weight_kg';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Self-reported fitness level on a scale of 1-10',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider', @level2type = N'COLUMN', @level2name = N'fitness_level';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Preferred riding terrain: road, gravel, mountain, urban, or mixed',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider', @level2type = N'COLUMN', @level2name = N'preferred_terrain';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON object containing aggregated lifetime statistics',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider', @level2type = N'COLUMN', @level2name = N'lifetime_stats';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'UTC timestamp when the rider account was created',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider', @level2type = N'COLUMN', @level2name = N'created_at';
GO

-- ============================================================================
-- TABLE: Bike
-- Stores bicycles owned by riders
-- ============================================================================

CREATE TABLE [MJ_Biking_App].[Bike] (
    [bike_id]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [rider_id]         UNIQUEIDENTIFIER NOT NULL,
    [name]             NVARCHAR(100)    NOT NULL,
    [bike_type]        NVARCHAR(20)     NULL,
    [weight_kg]        DECIMAL(5,2)     NULL,
    [wheel_size_in]    DECIMAL(4,2)     NULL,
    [total_distance_m] DECIMAL(12,2)    NOT NULL DEFAULT 0,
    [last_serviced]    DATETIME2        NULL,

    CONSTRAINT [PK_Bike] PRIMARY KEY CLUSTERED ([bike_id]),

    -- Foreign key to Rider with CASCADE delete
    CONSTRAINT [FK_Bike_Rider] FOREIGN KEY ([rider_id])
        REFERENCES [MJ_Biking_App].[Rider]([rider_id]) ON DELETE CASCADE,

    -- Enum constraint for bike_type
    CONSTRAINT [CK_Bike_bike_type] CHECK (
        [bike_type] IS NULL OR
        [bike_type] IN ('road', 'mountain', 'gravel', 'hybrid', 'bmx', 'electric', 'touring', 'cyclocross')
    ),

    -- Value range constraints
    CONSTRAINT [CK_Bike_weight_kg] CHECK ([weight_kg] IS NULL OR ([weight_kg] >= 0 AND [weight_kg] <= 50)),
    CONSTRAINT [CK_Bike_wheel_size_in] CHECK ([wheel_size_in] IS NULL OR ([wheel_size_in] >= 12 AND [wheel_size_in] <= 36)),
    CONSTRAINT [CK_Bike_total_distance_m] CHECK ([total_distance_m] >= 0)
);
GO

-- Extended properties for Bike table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores bicycles owned by riders',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App',
    @level1type = N'TABLE',  @level1name = N'Bike';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the bike',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Bike', @level2type = N'COLUMN', @level2name = N'bike_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Foreign key to the rider who owns this bike',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Bike', @level2type = N'COLUMN', @level2name = N'rider_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'User-defined name for the bike',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Bike', @level2type = N'COLUMN', @level2name = N'name';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Type of bicycle: road, mountain, gravel, hybrid, bmx, electric, touring, or cyclocross',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Bike', @level2type = N'COLUMN', @level2name = N'bike_type';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Weight of the bike in kilograms (0-50)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Bike', @level2type = N'COLUMN', @level2name = N'weight_kg';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Wheel diameter in inches (12-36)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Bike', @level2type = N'COLUMN', @level2name = N'wheel_size_in';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Total distance traveled on this bike in meters',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Bike', @level2type = N'COLUMN', @level2name = N'total_distance_m';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Date and time of the last service or maintenance',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Bike', @level2type = N'COLUMN', @level2name = N'last_serviced';
GO

-- ============================================================================
-- TABLE: Location
-- Stores geographic points of interest visited by riders
-- ============================================================================

CREATE TABLE [MJ_Biking_App].[Location] (
    [location_id]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [rider_id]          UNIQUEIDENTIFIER NOT NULL,
    [name]              NVARCHAR(150)    NOT NULL,
    [latitude]          DECIMAL(9,6)     NOT NULL,
    [longitude]         DECIMAL(9,6)     NOT NULL,
    [elevation_m]       DECIMAL(7,2)     NULL,
    [terrain_type]      NVARCHAR(20)     NULL,
    [surface_condition] NVARCHAR(20)     NULL,
    [difficulty_rating] DECIMAL(3,1)     NULL,
    [visit_count]       INT              NOT NULL DEFAULT 0,
    [first_visited]     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [PK_Location] PRIMARY KEY CLUSTERED ([location_id]),

    -- Foreign key to Rider with CASCADE delete
    CONSTRAINT [FK_Location_Rider] FOREIGN KEY ([rider_id])
        REFERENCES [MJ_Biking_App].[Rider]([rider_id]) ON DELETE CASCADE,

    -- Geographic coordinate constraints
    CONSTRAINT [CK_Location_latitude] CHECK ([latitude] >= -90 AND [latitude] <= 90),
    CONSTRAINT [CK_Location_longitude] CHECK ([longitude] >= -180 AND [longitude] <= 180),
    CONSTRAINT [CK_Location_elevation_m] CHECK ([elevation_m] IS NULL OR ([elevation_m] >= -500 AND [elevation_m] <= 9000)),

    -- Enum constraint for terrain_type
    CONSTRAINT [CK_Location_terrain_type] CHECK (
        [terrain_type] IS NULL OR
        [terrain_type] IN ('road', 'gravel', 'singletrack', 'doubletrack', 'paved_trail', 'urban', 'mountain')
    ),

    -- Enum constraint for surface_condition
    CONSTRAINT [CK_Location_surface_condition] CHECK (
        [surface_condition] IS NULL OR
        [surface_condition] IN ('dry', 'wet', 'muddy', 'icy', 'sandy', 'loose', 'packed')
    ),

    -- Value range constraints
    CONSTRAINT [CK_Location_difficulty_rating] CHECK ([difficulty_rating] IS NULL OR ([difficulty_rating] >= 1.0 AND [difficulty_rating] <= 10.0)),
    CONSTRAINT [CK_Location_visit_count] CHECK ([visit_count] >= 0)
);
GO

-- Extended properties for Location table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores geographic points of interest visited by riders',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App',
    @level1type = N'TABLE',  @level1name = N'Location';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the location',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'location_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Foreign key to the rider who discovered/saved this location',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'rider_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'User-defined name for the location',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'name';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Geographic latitude coordinate (-90 to 90 degrees)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'latitude';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Geographic longitude coordinate (-180 to 180 degrees)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'longitude';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Elevation above sea level in meters (-500 to 9000)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'elevation_m';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Type of terrain: road, gravel, singletrack, doubletrack, paved_trail, urban, or mountain',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'terrain_type';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current surface condition: dry, wet, muddy, icy, sandy, loose, or packed',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'surface_condition';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Difficulty rating for the location (1.0 to 10.0)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'difficulty_rating';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Number of times the rider has visited this location',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'visit_count';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'UTC timestamp when the location was first visited',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Location', @level2type = N'COLUMN', @level2name = N'first_visited';
GO

-- ============================================================================
-- TABLE: Weather
-- Stores weather condition snapshots at locations
-- ============================================================================

CREATE TABLE [MJ_Biking_App].[Weather] (
    [weather_id]         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [location_id]        UNIQUEIDENTIFIER NOT NULL,
    [temperature_c]      DECIMAL(5,2)     NULL,
    [humidity_pct]       DECIMAL(5,2)     NULL,
    [wind_speed_mps]     DECIMAL(6,2)     NULL,
    [wind_direction_deg] DECIMAL(5,2)     NULL,
    [precipitation_type] NVARCHAR(20)     NULL,
    [cloud_cover_pct]    INT              NULL,
    [visibility_km]      DECIMAL(6,2)     NULL,
    [observed_at]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [PK_Weather] PRIMARY KEY CLUSTERED ([weather_id]),

    -- Foreign key to Location with CASCADE delete
    CONSTRAINT [FK_Weather_Location] FOREIGN KEY ([location_id])
        REFERENCES [MJ_Biking_App].[Location]([location_id]) ON DELETE CASCADE,

    -- Value range constraints
    CONSTRAINT [CK_Weather_temperature_c] CHECK ([temperature_c] IS NULL OR ([temperature_c] >= -90 AND [temperature_c] <= 60)),
    CONSTRAINT [CK_Weather_humidity_pct] CHECK ([humidity_pct] IS NULL OR ([humidity_pct] >= 0 AND [humidity_pct] <= 100)),
    CONSTRAINT [CK_Weather_wind_speed_mps] CHECK ([wind_speed_mps] IS NULL OR ([wind_speed_mps] >= 0 AND [wind_speed_mps] <= 120)),
    CONSTRAINT [CK_Weather_wind_direction_deg] CHECK ([wind_direction_deg] IS NULL OR ([wind_direction_deg] >= 0 AND [wind_direction_deg] <= 360)),
    CONSTRAINT [CK_Weather_cloud_cover_pct] CHECK ([cloud_cover_pct] IS NULL OR ([cloud_cover_pct] >= 0 AND [cloud_cover_pct] <= 100)),
    CONSTRAINT [CK_Weather_visibility_km] CHECK ([visibility_km] IS NULL OR ([visibility_km] >= 0 AND [visibility_km] <= 100)),

    -- Enum constraint for precipitation_type
    CONSTRAINT [CK_Weather_precipitation_type] CHECK (
        [precipitation_type] IS NULL OR
        [precipitation_type] IN ('none', 'drizzle', 'rain', 'heavy_rain', 'snow', 'sleet', 'hail', 'fog')
    )
);
GO

-- Extended properties for Weather table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores weather condition snapshots at locations',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App',
    @level1type = N'TABLE',  @level1name = N'Weather';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the weather record',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'weather_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Foreign key to the location where weather was observed',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'location_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Temperature in Celsius (-90 to 60)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'temperature_c';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Relative humidity percentage (0-100)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'humidity_pct';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Wind speed in meters per second (0-120)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'wind_speed_mps';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Wind direction in degrees from north (0-360)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'wind_direction_deg';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Type of precipitation: none, drizzle, rain, heavy_rain, snow, sleet, hail, or fog',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'precipitation_type';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Cloud cover percentage (0-100)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'cloud_cover_pct';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Visibility in kilometers (0-100)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'visibility_km';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'UTC timestamp when the weather observation was recorded',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Weather', @level2type = N'COLUMN', @level2name = N'observed_at';
GO

-- ============================================================================
-- TABLE: Rider_Stats
-- Stores performance metrics and physiological data from ride sessions
-- ============================================================================

CREATE TABLE [MJ_Biking_App].[Rider_Stats] (
    [stats_id]           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [rider_id]           UNIQUEIDENTIFIER NOT NULL,
    [location_id]        UNIQUEIDENTIFIER NULL,
    [bike_id]            UNIQUEIDENTIFIER NULL,
    [avg_speed_mps]      DECIMAL(6,2)     NULL,
    [max_speed_mps]      DECIMAL(6,2)     NULL,
    [avg_heart_rate_bpm] INT              NULL,
    [max_heart_rate_bpm] INT              NULL,
    [cadence_rpm]        INT              NULL,
    [power_watts]        INT              NULL,
    [distance_m]         DECIMAL(12,2)    NOT NULL,
    [elevation_gain_m]   DECIMAL(8,2)     NULL,
    [duration_seconds]   INT              NOT NULL,
    [calories_burned]    INT              NULL,
    [effort_rating]      INT              NULL,
    [recorded_at]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [PK_Rider_Stats] PRIMARY KEY CLUSTERED ([stats_id]),

    -- Foreign key to Rider with CASCADE delete
    CONSTRAINT [FK_Rider_Stats_Rider] FOREIGN KEY ([rider_id])
        REFERENCES [MJ_Biking_App].[Rider]([rider_id]) ON DELETE CASCADE,

    -- Foreign key to Location with NO ACTION (nullable)
    CONSTRAINT [FK_Rider_Stats_Location] FOREIGN KEY ([location_id])
        REFERENCES [MJ_Biking_App].[Location]([location_id]) ON DELETE NO ACTION,

    -- Foreign key to Bike with NO ACTION (nullable)
    CONSTRAINT [FK_Rider_Stats_Bike] FOREIGN KEY ([bike_id])
        REFERENCES [MJ_Biking_App].[Bike]([bike_id]) ON DELETE NO ACTION,

    -- Speed constraints
    CONSTRAINT [CK_Rider_Stats_avg_speed_mps] CHECK ([avg_speed_mps] IS NULL OR ([avg_speed_mps] >= 0 AND [avg_speed_mps] <= 50)),
    CONSTRAINT [CK_Rider_Stats_max_speed_mps] CHECK ([max_speed_mps] IS NULL OR ([max_speed_mps] >= 0 AND [max_speed_mps] <= 80)),

    -- Logical consistency: max_speed must be >= avg_speed when both are present
    CONSTRAINT [CK_Rider_Stats_speed_consistency] CHECK (
        [avg_speed_mps] IS NULL OR [max_speed_mps] IS NULL OR [max_speed_mps] >= [avg_speed_mps]
    ),

    -- Heart rate constraints
    CONSTRAINT [CK_Rider_Stats_avg_heart_rate_bpm] CHECK ([avg_heart_rate_bpm] IS NULL OR ([avg_heart_rate_bpm] >= 30 AND [avg_heart_rate_bpm] <= 250)),
    CONSTRAINT [CK_Rider_Stats_max_heart_rate_bpm] CHECK ([max_heart_rate_bpm] IS NULL OR ([max_heart_rate_bpm] >= 30 AND [max_heart_rate_bpm] <= 250)),

    -- Logical consistency: max_heart_rate must be >= avg_heart_rate when both are present
    CONSTRAINT [CK_Rider_Stats_heart_rate_consistency] CHECK (
        [avg_heart_rate_bpm] IS NULL OR [max_heart_rate_bpm] IS NULL OR [max_heart_rate_bpm] >= [avg_heart_rate_bpm]
    ),

    -- Other value range constraints
    CONSTRAINT [CK_Rider_Stats_cadence_rpm] CHECK ([cadence_rpm] IS NULL OR ([cadence_rpm] >= 0 AND [cadence_rpm] <= 200)),
    CONSTRAINT [CK_Rider_Stats_power_watts] CHECK ([power_watts] IS NULL OR ([power_watts] >= 0 AND [power_watts] <= 2500)),
    CONSTRAINT [CK_Rider_Stats_distance_m] CHECK ([distance_m] >= 0),
    CONSTRAINT [CK_Rider_Stats_elevation_gain_m] CHECK ([elevation_gain_m] IS NULL OR ([elevation_gain_m] >= 0 AND [elevation_gain_m] <= 10000)),
    CONSTRAINT [CK_Rider_Stats_duration_seconds] CHECK ([duration_seconds] > 0),
    CONSTRAINT [CK_Rider_Stats_calories_burned] CHECK ([calories_burned] IS NULL OR ([calories_burned] >= 0 AND [calories_burned] <= 20000)),
    CONSTRAINT [CK_Rider_Stats_effort_rating] CHECK ([effort_rating] IS NULL OR ([effort_rating] >= 1 AND [effort_rating] <= 10))
);
GO

-- Extended properties for Rider_Stats table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores performance metrics and physiological data from ride sessions',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App',
    @level1type = N'TABLE',  @level1name = N'Rider_Stats';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the stats record',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'stats_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Foreign key to the rider who recorded these stats',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'rider_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Foreign key to the location where the ride took place (optional)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'location_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Foreign key to the bike used for the ride (optional)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'bike_id';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Average speed during the ride in meters per second (0-50)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'avg_speed_mps';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Maximum speed during the ride in meters per second (0-80, must be >= avg_speed)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'max_speed_mps';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Average heart rate during the ride in beats per minute (30-250)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'avg_heart_rate_bpm';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Maximum heart rate during the ride in beats per minute (30-250, must be >= avg_heart_rate)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'max_heart_rate_bpm';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Pedaling cadence in revolutions per minute (0-200)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'cadence_rpm';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Power output in watts (0-2500)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'power_watts';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Total distance covered in meters',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'distance_m';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Total elevation gained during the ride in meters (0-10000)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'elevation_gain_m';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Total duration of the ride in seconds (must be > 0)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'duration_seconds';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Estimated calories burned during the ride (0-20000)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'calories_burned';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Self-reported perceived effort rating (1-10)',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'effort_rating';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'UTC timestamp when the ride stats were recorded',
    @level0type = N'SCHEMA', @level0name = N'MJ_Biking_App', @level1type = N'TABLE', @level1name = N'Rider_Stats', @level2type = N'COLUMN', @level2name = N'recorded_at';
GO

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Indexes on foreign key columns
CREATE NONCLUSTERED INDEX [IX_Bike_rider_id]
    ON [MJ_Biking_App].[Bike]([rider_id]);
GO

CREATE NONCLUSTERED INDEX [IX_Location_rider_id]
    ON [MJ_Biking_App].[Location]([rider_id]);
GO

CREATE NONCLUSTERED INDEX [IX_Weather_location_id]
    ON [MJ_Biking_App].[Weather]([location_id]);
GO

CREATE NONCLUSTERED INDEX [IX_Rider_Stats_rider_id]
    ON [MJ_Biking_App].[Rider_Stats]([rider_id]);
GO

CREATE NONCLUSTERED INDEX [IX_Rider_Stats_location_id]
    ON [MJ_Biking_App].[Rider_Stats]([location_id]);
GO

CREATE NONCLUSTERED INDEX [IX_Rider_Stats_bike_id]
    ON [MJ_Biking_App].[Rider_Stats]([bike_id]);
GO

-- Indexes on timestamp columns for time-series queries
CREATE NONCLUSTERED INDEX [IX_Rider_created_at]
    ON [MJ_Biking_App].[Rider]([created_at]);
GO

CREATE NONCLUSTERED INDEX [IX_Location_first_visited]
    ON [MJ_Biking_App].[Location]([first_visited]);
GO

CREATE NONCLUSTERED INDEX [IX_Weather_observed_at]
    ON [MJ_Biking_App].[Weather]([observed_at]);
GO

CREATE NONCLUSTERED INDEX [IX_Rider_Stats_recorded_at]
    ON [MJ_Biking_App].[Rider_Stats]([recorded_at]);
GO

-- Composite index for geospatial lookups
CREATE NONCLUSTERED INDEX [IX_Location_coordinates]
    ON [MJ_Biking_App].[Location]([latitude], [longitude])
    INCLUDE ([name], [elevation_m], [terrain_type], [difficulty_rating]);
GO

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

PRINT '============================================================================';
PRINT 'Trailbloom (MJ_Biking_App) database schema created successfully!';
PRINT '';
PRINT 'Schema: MJ_Biking_App';
PRINT 'Tables created: 5';
PRINT '  - Rider (cyclist profiles and preferences)';
PRINT '  - Bike (bicycles owned by riders)';
PRINT '  - Location (geographic points of interest)';
PRINT '  - Weather (weather condition snapshots)';
PRINT '  - Rider_Stats (performance metrics and physiological data)';
PRINT '';
PRINT 'Features included:';
PRINT '  - Primary keys with UNIQUEIDENTIFIER and NEWID() defaults';
PRINT '  - Foreign keys with appropriate ON DELETE behavior';
PRINT '  - CHECK constraints for all enum-style columns';
PRINT '  - CHECK constraints for value range validation';
PRINT '  - Logical consistency constraints (e.g., max >= avg)';
PRINT '  - JSON validation for lifetime_stats column';
PRINT '  - Extended properties documenting all tables and columns';
PRINT '  - Performance indexes on foreign keys and timestamps';
PRINT '  - Composite geospatial index on (latitude, longitude)';
PRINT '============================================================================';
GO
