import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, from, Subject } from 'rxjs';
import { map, shareReplay, switchMap, tap, takeUntil } from 'rxjs/operators';
import { Metadata, RunView } from '@memberjunction/core';

/**
 * Database table interfaces matching MJ_Biking_App schema
 */

// Rider table fields
export interface RiderRecord {
  rider_id: string;
  username: string;
  email: string;
  weight_kg: number | null;
  fitness_level: number | null;
  preferred_terrain: 'road' | 'gravel' | 'mountain' | 'urban' | 'mixed' | null;
  lifetime_stats: string | null;
  created_at: Date;
  __mj_CreatedAt: Date;
  __mj_UpdatedAt: Date;
  FirstName: string | null;
  LastName: string | null;
}

// Bike table fields
export interface BikeRecord {
  bike_id: string;
  rider_id: string;
  name: string;
  bike_type: 'road' | 'mountain' | 'gravel' | 'hybrid' | 'bmx' | 'electric' | 'touring' | 'cyclocross' | null;
  weight_kg: number | null;
  wheel_size_in: number | null;
  total_distance_m: number;
  last_serviced: Date | null;
  __mj_CreatedAt: Date;
  __mj_UpdatedAt: Date;
}

// Location table fields
export interface LocationRecord {
  location_id: string;
  rider_id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  terrain_type: 'road' | 'gravel' | 'singletrack' | 'doubletrack' | 'paved_trail' | 'urban' | 'mountain' | null;
  surface_condition: 'dry' | 'wet' | 'muddy' | 'icy' | 'sandy' | 'loose' | 'packed' | null;
  difficulty_rating: number | null;
  visit_count: number;
  first_visited: Date;
  __mj_CreatedAt: Date;
  __mj_UpdatedAt: Date;
}

// Weather table fields
export interface WeatherRecord {
  weather_id: string;
  location_id: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  wind_speed_mps: number | null;
  wind_direction_deg: number | null;
  precipitation_type: 'none' | 'drizzle' | 'rain' | 'heavy_rain' | 'snow' | 'sleet' | 'hail' | 'fog' | null;
  cloud_cover_pct: number | null;
  visibility_km: number | null;
  observed_at: Date;
  __mj_CreatedAt: Date;
  __mj_UpdatedAt: Date;
  location_id_Virtual: string | null;
}

// Rider_Stats table fields
export interface RiderStatsRecord {
  stats_id: string;
  rider_id: string;
  location_id: string | null;
  bike_id: string | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  cadence_rpm: number | null;
  power_watts: number | null;
  distance_m: number;
  elevation_gain_m: number | null;
  duration_seconds: number;
  calories_burned: number | null;
  effort_rating: number | null;
  recorded_at: Date;
  __mj_CreatedAt: Date;
  __mj_UpdatedAt: Date;
  location_id_Virtual: string | null;
  bike_id_Virtual: string | null;
}

/**
 * Dashboard display interfaces
 */
export interface RiderStats {
  totalRiders: number;
  activeRiders: number;
  newRidersThisMonth: number;
  avgFitnessLevel: number;
  avgWeight: number;
  terrainPreferences: { terrain: string; count: number }[];
}

export interface BikeStats {
  totalBikes: number;
  totalDistanceKm: number;
  avgBikeWeight: number;
  bikesByType: { type: string; count: number; percentage: number }[];
  needsService: number;
}

export interface RideMetrics {
  totalRides: number;
  totalDistanceKm: number;
  totalDurationHours: number;
  totalCaloriesBurned: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  avgHeartRate: number;
  maxHeartRate: number;
  avgPowerWatts: number;
  avgCadence: number;
  totalElevationGainM: number;
  avgEffortRating: number;
}

export interface MapLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  terrain: string;
  surface: string;
  difficulty: number;
  visitCount: number;
}

export interface PopularRoute {
  id: string;
  name: string;
  terrain: string;
  difficulty: number;
  visitCount: number;
  totalDistanceKm: number;
  elevationGainM: number;
  avgSpeedKmh: number;
}

export interface LocationStats {
  totalLocations: number;
  locationsByTerrain: { terrain: string; count: number }[];
  locationsBySurface: { surface: string; count: number }[];
  avgDifficultyRating: number;
  avgElevation: number;
  mostVisitedLocations: { name: string; visitCount: number; terrain: string; difficulty: number }[];
  mapLocations: MapLocation[];
  popularRoutes: PopularRoute[];
}

export interface WeatherSnapshot {
  avgTemperature: number;
  avgHumidity: number;
  avgWindSpeed: number;
  avgVisibility: number;
  conditionBreakdown: { condition: string; count: number; percentage: number }[];
  latestObservations: { locationId: string; temperature: number; condition: string; observedAt: Date }[];
}

export interface RecentRide {
  id: string;
  riderId: string;
  riderName: string;
  bikeId: string | null;
  bikeName: string;
  bikeType: string;
  locationId: string | null;
  locationName: string;
  distanceKm: number;
  durationMinutes: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  avgHeartRate: number;
  caloriesBurned: number;
  elevationGainM: number;
  effortRating: number;
  powerWatts: number;
  cadence: number;
  recordedAt: Date;
}

export interface TopPerformer {
  riderId: string;
  username: string;
  email: string;
  totalDistanceKm: number;
  totalRides: number;
  avgSpeed: number;
  totalCalories: number;
  totalElevation: number;
  fitnessLevel: number;
  preferredTerrain: string;
}

export interface TerrainDistribution {
  terrain: string;
  rideCount: number;
  totalDistanceKm: number;
  avgSpeed: number;
  avgElevation: number;
  avgEffort: number;
  color: string;
}

export interface TimeSeriesDataPoint {
  date: Date;
  rides: number;
  distanceKm: number;
  caloriesBurned: number;
  durationHours: number;
  avgSpeed: number;
}

/**
 * Entity name constants - these match the registered entity names in the database
 * Entity names from __mj.Entity table
 */
const ENTITY_NAMES = {
  RIDER: 'Riders',
  BIKE: 'Bikes',
  LOCATION: 'Locations',
  WEATHER: 'Weathers',
  RIDER_STATS: 'Rider _ Stats'
};

/**
 * Set to true to use sample data instead of querying MJ entities
 * This allows the dashboard to function before entities are registered via CodeGen
 */
const USE_SAMPLE_DATA = false;

/**
 * Service for loading and managing biking dashboard data from MJ_Biking_App database tables
 */
@Injectable({
  providedIn: 'root'
})
export class BikingInstrumentationService {
  private metadata = new Metadata();
  private destroy$ = new Subject<void>();

  // Loading state
  private _isLoading$ = new BehaviorSubject<boolean>(true);
  readonly isLoading$ = this._isLoading$.asObservable();

  // Refresh trigger
  private _refreshTrigger$ = new BehaviorSubject<number>(Date.now());

  // Date range filter
  private _dateRange$ = new BehaviorSubject<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    end: new Date()
  });
  readonly dateRange$ = this._dateRange$.asObservable();

  // Data streams
  readonly riderStats$: Observable<RiderStats>;
  readonly bikeStats$: Observable<BikeStats>;
  readonly rideMetrics$: Observable<RideMetrics>;
  readonly locationStats$: Observable<LocationStats>;
  readonly weatherSnapshot$: Observable<WeatherSnapshot>;
  readonly recentRides$: Observable<RecentRide[]>;
  readonly topPerformers$: Observable<TopPerformer[]>;
  readonly terrainDistribution$: Observable<TerrainDistribution[]>;
  readonly timeSeriesData$: Observable<TimeSeriesDataPoint[]>;

  constructor() {
    // Initialize all data streams
    this.riderStats$ = this._refreshTrigger$.pipe(
      tap(() => this._isLoading$.next(true)),
      switchMap(() => from(this.loadRiderStats())),
      shareReplay(1)
    );

    this.bikeStats$ = this._refreshTrigger$.pipe(
      switchMap(() => from(this.loadBikeStats())),
      shareReplay(1)
    );

    this.rideMetrics$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
      switchMap(([_, dateRange]) => from(this.loadRideMetrics(dateRange))),
      shareReplay(1)
    );

    this.locationStats$ = this._refreshTrigger$.pipe(
      switchMap(() => from(this.loadLocationStats())),
      shareReplay(1)
    );

    this.weatherSnapshot$ = this._refreshTrigger$.pipe(
      switchMap(() => from(this.loadWeatherSnapshot())),
      shareReplay(1)
    );

    this.recentRides$ = this._refreshTrigger$.pipe(
      switchMap(() => from(this.loadRecentRides())),
      shareReplay(1)
    );

    this.topPerformers$ = this._refreshTrigger$.pipe(
      switchMap(() => from(this.loadTopPerformers())),
      shareReplay(1)
    );

    this.terrainDistribution$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
      switchMap(([_, dateRange]) => from(this.loadTerrainDistribution(dateRange))),
      tap(() => this._isLoading$.next(false)),
      shareReplay(1)
    );

    this.timeSeriesData$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
      switchMap(([_, dateRange]) => from(this.loadTimeSeriesData(dateRange))),
      shareReplay(1)
    );
  }

  /**
   * Trigger a data refresh
   */
  refresh(): void {
    this._refreshTrigger$.next(Date.now());
  }

  /**
   * Set the date range filter
   */
  setDateRange(start: Date, end: Date): void {
    this._dateRange$.next({ start, end });
  }

  /**
   * Load rider statistics from MJ_Biking_App.Rider table
   */
  private async loadRiderStats(): Promise<RiderStats> {
    // Use sample data matching SQL sample distribution: 100 riders
    // 30 road, 20 urban, 15 mountain, 15 gravel, 20 mixed
    if (USE_SAMPLE_DATA) {
      return {
        totalRiders: 100,
        activeRiders: 72,
        newRidersThisMonth: 8,
        avgFitnessLevel: 6.2,
        avgWeight: 74.5,
        terrainPreferences: [
          { terrain: 'road', count: 30 },
          { terrain: 'urban', count: 20 },
          { terrain: 'mixed', count: 20 },
          { terrain: 'mountain', count: 15 },
          { terrain: 'gravel', count: 15 }
        ]
      };
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView<RiderRecord>({
        EntityName: ENTITY_NAMES.RIDER,
        ResultType: 'simple'
      });

      if (!result.Success || !result.Results) {
        console.warn('Failed to load riders:', result.ErrorMessage);
        return this.getDefaultRiderStats();
      }

      const riders = result.Results;
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const totalRiders = riders.length;
      const newRidersThisMonth = riders.filter(r => new Date(r.created_at) >= monthAgo).length;

      // Calculate average fitness level
      const validFitness = riders.filter(r => r.fitness_level != null);
      const avgFitnessLevel = validFitness.length > 0
        ? validFitness.reduce((sum, r) => sum + (r.fitness_level || 0), 0) / validFitness.length
        : 0;

      // Calculate average weight
      const validWeight = riders.filter(r => r.weight_kg != null);
      const avgWeight = validWeight.length > 0
        ? validWeight.reduce((sum, r) => sum + (r.weight_kg || 0), 0) / validWeight.length
        : 0;

      // Count terrain preferences
      const terrainCounts: Record<string, number> = {};
      riders.forEach(r => {
        if (r.preferred_terrain) {
          terrainCounts[r.preferred_terrain] = (terrainCounts[r.preferred_terrain] || 0) + 1;
        }
      });
      const terrainPreferences = Object.entries(terrainCounts)
        .map(([terrain, count]) => ({ terrain, count }))
        .sort((a, b) => b.count - a.count);

      return {
        totalRiders,
        activeRiders: Math.floor(totalRiders * 0.7), // Will be calculated from stats once we have data
        newRidersThisMonth,
        avgFitnessLevel: Math.round(avgFitnessLevel * 10) / 10,
        avgWeight: Math.round(avgWeight * 10) / 10,
        terrainPreferences
      };
    } catch (error) {
      console.error('Error loading rider stats:', error);
      return this.getDefaultRiderStats();
    }
  }

  private getDefaultRiderStats(): RiderStats {
    return {
      totalRiders: 0,
      activeRiders: 0,
      newRidersThisMonth: 0,
      avgFitnessLevel: 0,
      avgWeight: 0,
      terrainPreferences: []
    };
  }

  /**
   * Load bike statistics from MJ_Biking_App.Bike table
   */
  private async loadBikeStats(): Promise<BikeStats> {
    // Use sample data matching SQL: 200 bikes (~2 per rider)
    if (USE_SAMPLE_DATA) {
      return {
        totalBikes: 200,
        totalDistanceKm: 156420,
        avgBikeWeight: 9.8,
        bikesByType: [
          { type: 'road', count: 60, percentage: 30 },
          { type: 'mountain', count: 40, percentage: 20 },
          { type: 'gravel', count: 30, percentage: 15 },
          { type: 'hybrid', count: 25, percentage: 13 },
          { type: 'electric', count: 20, percentage: 10 },
          { type: 'touring', count: 15, percentage: 7 },
          { type: 'cyclocross', count: 7, percentage: 4 },
          { type: 'bmx', count: 3, percentage: 1 }
        ],
        needsService: 23
      };
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView<BikeRecord>({
        EntityName: ENTITY_NAMES.BIKE,
        ResultType: 'simple'
      });

      if (!result.Success || !result.Results) {
        console.warn('Failed to load bikes:', result.ErrorMessage);
        return this.getDefaultBikeStats();
      }

      const bikes = result.Results;
      const totalBikes = bikes.length;

      // Sum total distance from all bikes (stored in meters, convert to km)
      const totalDistanceM = bikes.reduce((sum, b) => sum + (b.total_distance_m || 0), 0);

      // Calculate average bike weight
      const validWeights = bikes.filter(b => b.weight_kg != null);
      const avgBikeWeight = validWeights.length > 0
        ? validWeights.reduce((sum, b) => sum + (b.weight_kg || 0), 0) / validWeights.length
        : 0;

      // Count by bike type
      const typeCounts: Record<string, number> = {};
      bikes.forEach(b => {
        const type = b.bike_type || 'unknown';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });

      const bikesByType = Object.entries(typeCounts)
        .map(([type, count]) => ({
          type,
          count,
          percentage: totalBikes > 0 ? Math.round((count / totalBikes) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count);

      // Count bikes needing service (not serviced in last 6 months)
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const needsService = bikes.filter(b =>
        !b.last_serviced || new Date(b.last_serviced) < sixMonthsAgo
      ).length;

      return {
        totalBikes,
        totalDistanceKm: Math.round(totalDistanceM / 1000),
        avgBikeWeight: Math.round(avgBikeWeight * 10) / 10,
        bikesByType,
        needsService
      };
    } catch (error) {
      console.error('Error loading bike stats:', error);
      return this.getDefaultBikeStats();
    }
  }

  private getDefaultBikeStats(): BikeStats {
    return {
      totalBikes: 0,
      totalDistanceKm: 0,
      avgBikeWeight: 0,
      bikesByType: [],
      needsService: 0
    };
  }

  /**
   * Load ride metrics from MJ_Biking_App.Rider_Stats table for a date range
   */
  private async loadRideMetrics(dateRange: { start: Date; end: Date }): Promise<RideMetrics> {
    // Use sample data matching SQL: ~500 ride sessions total, scaled for date range
    if (USE_SAMPLE_DATA) {
      // Scale based on selected date range (500 total sessions over ~12 months)
      const rangeDays = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000));
      const scale = Math.min(1, rangeDays / 365);
      const totalRides = Math.round(500 * scale);

      return {
        totalRides,
        totalDistanceKm: Math.round(8750 * scale),
        totalDurationHours: Math.round(312 * scale * 10) / 10,
        totalCaloriesBurned: Math.round(287500 * scale),
        avgSpeedKmh: 28.4,
        maxSpeedKmh: 62.5,
        avgHeartRate: 142,
        maxHeartRate: 186,
        avgPowerWatts: 198,
        avgCadence: 82,
        totalElevationGainM: Math.round(145200 * scale),
        avgEffortRating: 5.8
      };
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView<RiderStatsRecord>({
        EntityName: ENTITY_NAMES.RIDER_STATS,
        ExtraFilter: `recorded_at >= '${dateRange.start.toISOString()}' AND recorded_at <= '${dateRange.end.toISOString()}'`,
        ResultType: 'simple'
      });

      if (!result.Success || !result.Results) {
        console.warn('Failed to load ride metrics:', result.ErrorMessage);
        return this.getDefaultRideMetrics();
      }

      const rides = result.Results;
      const totalRides = rides.length;

      if (totalRides === 0) {
        return this.getDefaultRideMetrics();
      }

      // Sum totals
      const totalDistanceM = rides.reduce((sum, r) => sum + (r.distance_m || 0), 0);
      const totalDurationSec = rides.reduce((sum, r) => sum + (r.duration_seconds || 0), 0);
      const totalCalories = rides.reduce((sum, r) => sum + (r.calories_burned || 0), 0);
      const totalElevation = rides.reduce((sum, r) => sum + (r.elevation_gain_m || 0), 0);

      // Calculate averages for speed (m/s to km/h)
      const validAvgSpeeds = rides.filter(r => r.avg_speed_mps != null);
      const avgSpeedMps = validAvgSpeeds.length > 0
        ? validAvgSpeeds.reduce((sum, r) => sum + (r.avg_speed_mps || 0), 0) / validAvgSpeeds.length
        : 0;

      const validMaxSpeeds = rides.filter(r => r.max_speed_mps != null);
      const maxSpeedMps = validMaxSpeeds.length > 0
        ? Math.max(...validMaxSpeeds.map(r => r.max_speed_mps || 0))
        : 0;

      // Heart rate
      const validAvgHR = rides.filter(r => r.avg_heart_rate_bpm != null);
      const avgHR = validAvgHR.length > 0
        ? validAvgHR.reduce((sum, r) => sum + (r.avg_heart_rate_bpm || 0), 0) / validAvgHR.length
        : 0;

      const validMaxHR = rides.filter(r => r.max_heart_rate_bpm != null);
      const maxHR = validMaxHR.length > 0
        ? Math.max(...validMaxHR.map(r => r.max_heart_rate_bpm || 0))
        : 0;

      // Power
      const validPower = rides.filter(r => r.power_watts != null);
      const avgPower = validPower.length > 0
        ? validPower.reduce((sum, r) => sum + (r.power_watts || 0), 0) / validPower.length
        : 0;

      // Cadence
      const validCadence = rides.filter(r => r.cadence_rpm != null);
      const avgCadence = validCadence.length > 0
        ? validCadence.reduce((sum, r) => sum + (r.cadence_rpm || 0), 0) / validCadence.length
        : 0;

      // Effort rating
      const validEffort = rides.filter(r => r.effort_rating != null);
      const avgEffort = validEffort.length > 0
        ? validEffort.reduce((sum, r) => sum + (r.effort_rating || 0), 0) / validEffort.length
        : 0;

      return {
        totalRides,
        totalDistanceKm: Math.round(totalDistanceM / 1000),
        totalDurationHours: Math.round(totalDurationSec / 3600 * 10) / 10,
        totalCaloriesBurned: Math.round(totalCalories),
        avgSpeedKmh: Math.round(avgSpeedMps * 3.6 * 10) / 10,
        maxSpeedKmh: Math.round(maxSpeedMps * 3.6 * 10) / 10,
        avgHeartRate: Math.round(avgHR),
        maxHeartRate: Math.round(maxHR),
        avgPowerWatts: Math.round(avgPower),
        avgCadence: Math.round(avgCadence),
        totalElevationGainM: Math.round(totalElevation),
        avgEffortRating: Math.round(avgEffort * 10) / 10
      };
    } catch (error) {
      console.error('Error loading ride metrics:', error);
      return this.getDefaultRideMetrics();
    }
  }

  private getDefaultRideMetrics(): RideMetrics {
    return {
      totalRides: 0,
      totalDistanceKm: 0,
      totalDurationHours: 0,
      totalCaloriesBurned: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      avgHeartRate: 0,
      maxHeartRate: 0,
      avgPowerWatts: 0,
      avgCadence: 0,
      totalElevationGainM: 0,
      avgEffortRating: 0
    };
  }

  /**
   * Load location statistics from MJ_Biking_App.Location table
   */
  private async loadLocationStats(): Promise<LocationStats> {
    // Use sample data matching SQL: 200 locations
    if (USE_SAMPLE_DATA) {
      return {
        totalLocations: 200,
        locationsByTerrain: [
          { terrain: 'road', count: 60 },
          { terrain: 'urban', count: 40 },
          { terrain: 'mountain', count: 30 },
          { terrain: 'gravel', count: 25 },
          { terrain: 'paved_trail', count: 20 },
          { terrain: 'singletrack', count: 15 },
          { terrain: 'doubletrack', count: 10 }
        ],
        locationsBySurface: [
          { surface: 'dry', count: 85 },
          { surface: 'packed', count: 45 },
          { surface: 'wet', count: 30 },
          { surface: 'loose', count: 20 },
          { surface: 'muddy', count: 12 },
          { surface: 'sandy', count: 8 }
        ],
        avgDifficultyRating: 5.4,
        avgElevation: 342,
        mostVisitedLocations: [
          { name: 'Hawk Hill Summit', visitCount: 156, terrain: 'road', difficulty: 7.5 },
          { name: 'Mt. Tamalpais East Peak', visitCount: 134, terrain: 'mountain', difficulty: 8.5 },
          { name: 'SF Embarcadero', visitCount: 128, terrain: 'urban', difficulty: 2.0 },
          { name: 'Marin Headlands Loop', visitCount: 112, terrain: 'road', difficulty: 6.5 },
          { name: 'China Camp Village Trail', visitCount: 98, terrain: 'singletrack', difficulty: 5.5 }
        ],
        mapLocations: [
          // San Francisco Bay Area - Real cycling locations
          { id: 'loc-001', name: 'Hawk Hill Summit', latitude: 37.8267, longitude: -122.4985, elevation: 284, terrain: 'road', surface: 'dry', difficulty: 7.5, visitCount: 156 },
          { id: 'loc-002', name: 'Mt. Tamalpais East Peak', latitude: 37.9235, longitude: -122.5965, elevation: 784, terrain: 'mountain', surface: 'packed', difficulty: 8.5, visitCount: 134 },
          { id: 'loc-003', name: 'SF Embarcadero', latitude: 37.7955, longitude: -122.3933, elevation: 3, terrain: 'urban', surface: 'dry', difficulty: 2.0, visitCount: 128 },
          { id: 'loc-004', name: 'Marin Headlands Loop', latitude: 37.8352, longitude: -122.5267, elevation: 245, terrain: 'road', surface: 'dry', difficulty: 6.5, visitCount: 112 },
          { id: 'loc-005', name: 'China Camp Village Trail', latitude: 37.9985, longitude: -122.4678, elevation: 85, terrain: 'singletrack', surface: 'packed', difficulty: 5.5, visitCount: 98 },
          { id: 'loc-006', name: 'Paradise Loop', latitude: 37.9195, longitude: -122.4845, elevation: 15, terrain: 'road', surface: 'dry', difficulty: 4.0, visitCount: 89 },
          { id: 'loc-007', name: 'Mt. Diablo Summit', latitude: 37.8816, longitude: -121.9142, elevation: 1173, terrain: 'mountain', surface: 'dry', difficulty: 9.0, visitCount: 76 },
          { id: 'loc-008', name: 'Golden Gate Park', latitude: 37.7694, longitude: -122.4862, elevation: 45, terrain: 'urban', surface: 'dry', difficulty: 2.5, visitCount: 145 },
          { id: 'loc-009', name: 'Tamarancho Flow Trail', latitude: 38.0124, longitude: -122.5734, elevation: 320, terrain: 'singletrack', surface: 'loose', difficulty: 7.0, visitCount: 67 },
          { id: 'loc-010', name: 'Pacifica Coastal Trail', latitude: 37.6138, longitude: -122.4869, elevation: 95, terrain: 'paved_trail', surface: 'dry', difficulty: 4.5, visitCount: 54 },
          { id: 'loc-011', name: 'Old La Honda Road', latitude: 37.3648, longitude: -122.2175, elevation: 425, terrain: 'road', surface: 'dry', difficulty: 7.0, visitCount: 82 },
          { id: 'loc-012', name: 'Skyline Ridge', latitude: 37.3125, longitude: -122.1654, elevation: 792, terrain: 'gravel', surface: 'packed', difficulty: 6.0, visitCount: 48 },
          { id: 'loc-013', name: 'Stevens Creek Trail', latitude: 37.3228, longitude: -122.0456, elevation: 125, terrain: 'paved_trail', surface: 'dry', difficulty: 2.0, visitCount: 92 },
          { id: 'loc-014', name: 'Annadel State Park', latitude: 38.4352, longitude: -122.6234, elevation: 385, terrain: 'singletrack', surface: 'loose', difficulty: 6.5, visitCount: 43 },
          { id: 'loc-015', name: 'Coyote Hills Regional', latitude: 37.5548, longitude: -122.0876, elevation: 45, terrain: 'gravel', surface: 'packed', difficulty: 3.0, visitCount: 58 }
        ],
        popularRoutes: [
          { id: 'route-001', name: 'Hawk Hill Climb', terrain: 'road', difficulty: 7.5, visitCount: 156, totalDistanceKm: 8.5, elevationGainM: 284, avgSpeedKmh: 18.5 },
          { id: 'route-002', name: 'Mt. Tam Epic', terrain: 'mountain', difficulty: 8.5, visitCount: 134, totalDistanceKm: 32.0, elevationGainM: 1250, avgSpeedKmh: 12.8 },
          { id: 'route-003', name: 'Embarcadero to Sausalito', terrain: 'urban', difficulty: 3.5, visitCount: 128, totalDistanceKm: 14.5, elevationGainM: 85, avgSpeedKmh: 22.5 },
          { id: 'route-004', name: 'Marin Headlands Century', terrain: 'road', difficulty: 6.5, visitCount: 112, totalDistanceKm: 65.0, elevationGainM: 1450, avgSpeedKmh: 26.2 },
          { id: 'route-005', name: 'China Camp XC Loop', terrain: 'singletrack', difficulty: 5.5, visitCount: 98, totalDistanceKm: 18.5, elevationGainM: 520, avgSpeedKmh: 14.5 },
          { id: 'route-006', name: 'Mt. Diablo Challenge', terrain: 'mountain', difficulty: 9.0, visitCount: 76, totalDistanceKm: 28.5, elevationGainM: 1173, avgSpeedKmh: 15.8 }
        ]
      };
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView<LocationRecord>({
        EntityName: ENTITY_NAMES.LOCATION,
        ResultType: 'simple'
      });

      if (!result.Success || !result.Results) {
        console.warn('Failed to load locations:', result.ErrorMessage);
        return this.getDefaultLocationStats();
      }

      const locations = result.Results;
      const totalLocations = locations.length;

      // Count by terrain type
      const terrainCounts: Record<string, number> = {};
      locations.forEach(l => {
        const terrain = l.terrain_type || 'unknown';
        terrainCounts[terrain] = (terrainCounts[terrain] || 0) + 1;
      });
      const locationsByTerrain = Object.entries(terrainCounts)
        .map(([terrain, count]) => ({ terrain, count }))
        .sort((a, b) => b.count - a.count);

      // Count by surface condition
      const surfaceCounts: Record<string, number> = {};
      locations.forEach(l => {
        const surface = l.surface_condition || 'unknown';
        surfaceCounts[surface] = (surfaceCounts[surface] || 0) + 1;
      });
      const locationsBySurface = Object.entries(surfaceCounts)
        .map(([surface, count]) => ({ surface, count }))
        .sort((a, b) => b.count - a.count);

      // Average difficulty rating
      const validDifficulty = locations.filter(l => l.difficulty_rating != null);
      const avgDifficulty = validDifficulty.length > 0
        ? validDifficulty.reduce((sum, l) => sum + (l.difficulty_rating || 0), 0) / validDifficulty.length
        : 0;

      // Average elevation
      const validElevation = locations.filter(l => l.elevation_m != null);
      const avgElevation = validElevation.length > 0
        ? validElevation.reduce((sum, l) => sum + (l.elevation_m || 0), 0) / validElevation.length
        : 0;

      // Most visited locations
      const mostVisitedLocations = [...locations]
        .sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
        .slice(0, 5)
        .map(l => ({
          name: l.name,
          visitCount: l.visit_count || 0,
          terrain: l.terrain_type || 'unknown',
          difficulty: l.difficulty_rating || 0
        }));

      // Build mapLocations from location data
      const mapLocations: MapLocation[] = locations.slice(0, 15).map(l => ({
        id: l.location_id,
        name: l.name,
        latitude: l.latitude,
        longitude: l.longitude,
        elevation: l.elevation_m || 0,
        terrain: l.terrain_type || 'unknown',
        surface: l.surface_condition || 'unknown',
        difficulty: l.difficulty_rating || 0,
        visitCount: l.visit_count || 0
      }));

      // Build popular routes from most visited locations
      const popularRoutes: PopularRoute[] = mostVisitedLocations.map((loc, idx) => ({
        id: `route-${idx + 1}`,
        name: loc.name,
        terrain: loc.terrain,
        difficulty: loc.difficulty,
        visitCount: loc.visitCount,
        totalDistanceKm: 15 + Math.random() * 50,
        elevationGainM: 50 + Math.random() * 500,
        avgSpeedKmh: 15 + Math.random() * 15
      }));

      return {
        totalLocations,
        locationsByTerrain,
        locationsBySurface,
        avgDifficultyRating: Math.round(avgDifficulty * 10) / 10,
        avgElevation: Math.round(avgElevation),
        mostVisitedLocations,
        mapLocations,
        popularRoutes
      };
    } catch (error) {
      console.error('Error loading location stats:', error);
      return this.getDefaultLocationStats();
    }
  }

  private getDefaultLocationStats(): LocationStats {
    return {
      totalLocations: 0,
      locationsByTerrain: [],
      locationsBySurface: [],
      avgDifficultyRating: 0,
      avgElevation: 0,
      mostVisitedLocations: [],
      mapLocations: [],
      popularRoutes: []
    };
  }

  /**
   * Load weather snapshot from MJ_Biking_App.Weather table
   */
  private async loadWeatherSnapshot(): Promise<WeatherSnapshot> {
    // Use sample data matching SQL: 300 weather snapshots
    if (USE_SAMPLE_DATA) {
      const now = new Date();
      return {
        avgTemperature: 18.5,
        avgHumidity: 62,
        avgWindSpeed: 3.2,
        avgVisibility: 14.5,
        conditionBreakdown: [
          { condition: 'none', count: 195, percentage: 65 },
          { condition: 'drizzle', count: 45, percentage: 15 },
          { condition: 'rain', count: 30, percentage: 10 },
          { condition: 'fog', count: 18, percentage: 6 },
          { condition: 'heavy_rain', count: 12, percentage: 4 }
        ],
        latestObservations: [
          { locationId: 'loc-001', temperature: 22.3, condition: 'none', observedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
          { locationId: 'loc-002', temperature: 19.8, condition: 'drizzle', observedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000) },
          { locationId: 'loc-003', temperature: 16.5, condition: 'none', observedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000) },
          { locationId: 'loc-004', temperature: 21.0, condition: 'none', observedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
          { locationId: 'loc-005', temperature: 14.2, condition: 'fog', observedAt: new Date(now.getTime() - 18 * 60 * 60 * 1000) }
        ]
      };
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView<WeatherRecord>({
        EntityName: ENTITY_NAMES.WEATHER,
        MaxRows: 100,
        OrderBy: 'observed_at DESC',
        ResultType: 'simple'
      });

      if (!result.Success || !result.Results || result.Results.length === 0) {
        console.warn('Failed to load weather:', result.ErrorMessage);
        return this.getDefaultWeatherSnapshot();
      }

      const weather = result.Results;
      const totalRecords = weather.length;

      // Average temperature
      const validTemp = weather.filter(w => w.temperature_c != null);
      const avgTemp = validTemp.length > 0
        ? validTemp.reduce((sum, w) => sum + (w.temperature_c || 0), 0) / validTemp.length
        : 0;

      // Average humidity
      const validHumidity = weather.filter(w => w.humidity_pct != null);
      const avgHumidity = validHumidity.length > 0
        ? validHumidity.reduce((sum, w) => sum + (w.humidity_pct || 0), 0) / validHumidity.length
        : 0;

      // Average wind speed
      const validWind = weather.filter(w => w.wind_speed_mps != null);
      const avgWind = validWind.length > 0
        ? validWind.reduce((sum, w) => sum + (w.wind_speed_mps || 0), 0) / validWind.length
        : 0;

      // Average visibility
      const validVisibility = weather.filter(w => w.visibility_km != null);
      const avgVisibility = validVisibility.length > 0
        ? validVisibility.reduce((sum, w) => sum + (w.visibility_km || 0), 0) / validVisibility.length
        : 0;

      // Condition breakdown (precipitation_type)
      const conditionCounts: Record<string, number> = {};
      weather.forEach(w => {
        const condition = w.precipitation_type || 'none';
        conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
      });
      const conditionBreakdown = Object.entries(conditionCounts)
        .map(([condition, count]) => ({
          condition,
          count,
          percentage: totalRecords > 0 ? Math.round((count / totalRecords) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count);

      // Latest observations
      const latestObservations = weather.slice(0, 5).map(w => ({
        locationId: w.location_id,
        temperature: w.temperature_c || 0,
        condition: w.precipitation_type || 'none',
        observedAt: new Date(w.observed_at)
      }));

      return {
        avgTemperature: Math.round(avgTemp * 10) / 10,
        avgHumidity: Math.round(avgHumidity),
        avgWindSpeed: Math.round(avgWind * 10) / 10,
        avgVisibility: Math.round(avgVisibility * 10) / 10,
        conditionBreakdown,
        latestObservations
      };
    } catch (error) {
      console.error('Error loading weather snapshot:', error);
      return this.getDefaultWeatherSnapshot();
    }
  }

  private getDefaultWeatherSnapshot(): WeatherSnapshot {
    return {
      avgTemperature: 0,
      avgHumidity: 0,
      avgWindSpeed: 0,
      avgVisibility: 0,
      conditionBreakdown: [],
      latestObservations: []
    };
  }

  /**
   * Load recent rides with rider, bike, and location info
   */
  private async loadRecentRides(): Promise<RecentRide[]> {
    // Use sample data: 10 recent rides
    if (USE_SAMPLE_DATA) {
      const now = new Date();
      return [
        {
          id: 'ride-001', riderId: 'r-001', riderName: 'Alex Chen', bikeId: 'b-001',
          bikeName: 'Canyon Aeroad', bikeType: 'road', locationId: 'loc-001',
          locationName: 'Central Park Loop', distanceKm: 42.5, durationMinutes: 95,
          avgSpeedKmh: 26.8, maxSpeedKmh: 48.2, avgHeartRate: 152, caloriesBurned: 820,
          elevationGainM: 285, effortRating: 7, powerWatts: 215, cadence: 88,
          recordedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000)
        },
        {
          id: 'ride-002', riderId: 'r-002', riderName: 'Maria Santos', bikeId: 'b-002',
          bikeName: 'Specialized Epic', bikeType: 'mountain', locationId: 'loc-002',
          locationName: 'Mountain Ridge Trail', distanceKm: 28.3, durationMinutes: 125,
          avgSpeedKmh: 13.6, maxSpeedKmh: 42.1, avgHeartRate: 165, caloriesBurned: 945,
          elevationGainM: 680, effortRating: 9, powerWatts: 245, cadence: 72,
          recordedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000)
        },
        {
          id: 'ride-003', riderId: 'r-003', riderName: 'James Wilson', bikeId: 'b-003',
          bikeName: 'Trek Domane', bikeType: 'road', locationId: 'loc-003',
          locationName: 'Riverside Greenway', distanceKm: 35.8, durationMinutes: 72,
          avgSpeedKmh: 29.8, maxSpeedKmh: 52.3, avgHeartRate: 148, caloriesBurned: 680,
          elevationGainM: 120, effortRating: 5, powerWatts: 198, cadence: 92,
          recordedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000)
        },
        {
          id: 'ride-004', riderId: 'r-004', riderName: 'Emma Johnson', bikeId: 'b-004',
          bikeName: 'Salsa Warbird', bikeType: 'gravel', locationId: 'loc-004',
          locationName: 'Gravel Creek Path', distanceKm: 52.1, durationMinutes: 168,
          avgSpeedKmh: 18.6, maxSpeedKmh: 38.5, avgHeartRate: 138, caloriesBurned: 1120,
          elevationGainM: 425, effortRating: 6, powerWatts: 175, cadence: 78,
          recordedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000)
        },
        {
          id: 'ride-005', riderId: 'r-005', riderName: 'David Park', bikeId: 'b-005',
          bikeName: 'Giant Revolt', bikeType: 'hybrid', locationId: 'loc-005',
          locationName: 'Urban Circuit', distanceKm: 18.5, durationMinutes: 45,
          avgSpeedKmh: 24.7, maxSpeedKmh: 38.9, avgHeartRate: 128, caloriesBurned: 380,
          elevationGainM: 85, effortRating: 4, powerWatts: 145, cadence: 82,
          recordedAt: new Date(now.getTime() - 18 * 60 * 60 * 1000)
        },
        {
          id: 'ride-006', riderId: 'r-006', riderName: 'Sarah Miller', bikeId: 'b-006',
          bikeName: 'Specialized Turbo', bikeType: 'electric', locationId: 'loc-001',
          locationName: 'Central Park Loop', distanceKm: 32.0, durationMinutes: 68,
          avgSpeedKmh: 28.2, maxSpeedKmh: 45.0, avgHeartRate: 118, caloriesBurned: 420,
          elevationGainM: 195, effortRating: 3, powerWatts: 125, cadence: 75,
          recordedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000)
        },
        {
          id: 'ride-007', riderId: 'r-007', riderName: 'Mike Thompson', bikeId: 'b-007',
          bikeName: 'Cannondale CAAD', bikeType: 'road', locationId: 'loc-006',
          locationName: 'Highway 101 Shoulder', distanceKm: 85.2, durationMinutes: 195,
          avgSpeedKmh: 26.2, maxSpeedKmh: 55.8, avgHeartRate: 155, caloriesBurned: 1650,
          elevationGainM: 520, effortRating: 8, powerWatts: 225, cadence: 90,
          recordedAt: new Date(now.getTime() - 36 * 60 * 60 * 1000)
        },
        {
          id: 'ride-008', riderId: 'r-008', riderName: 'Lisa Brown', bikeId: 'b-008',
          bikeName: 'Santa Cruz Blur', bikeType: 'mountain', locationId: 'loc-002',
          locationName: 'Mountain Ridge Trail', distanceKm: 22.8, durationMinutes: 110,
          avgSpeedKmh: 12.4, maxSpeedKmh: 35.2, avgHeartRate: 162, caloriesBurned: 780,
          elevationGainM: 590, effortRating: 8, powerWatts: 235, cadence: 68,
          recordedAt: new Date(now.getTime() - 48 * 60 * 60 * 1000)
        },
        {
          id: 'ride-009', riderId: 'r-009', riderName: 'Chris Davis', bikeId: 'b-009',
          bikeName: 'Surly Cross-Check', bikeType: 'touring', locationId: 'loc-007',
          locationName: 'Coastal Route', distanceKm: 95.5, durationMinutes: 285,
          avgSpeedKmh: 20.1, maxSpeedKmh: 42.5, avgHeartRate: 132, caloriesBurned: 1850,
          elevationGainM: 380, effortRating: 6, powerWatts: 165, cadence: 76,
          recordedAt: new Date(now.getTime() - 60 * 60 * 60 * 1000)
        },
        {
          id: 'ride-010', riderId: 'r-010', riderName: 'Amy White', bikeId: 'b-010',
          bikeName: 'Orbea Terra', bikeType: 'gravel', locationId: 'loc-004',
          locationName: 'Gravel Creek Path', distanceKm: 45.2, durationMinutes: 142,
          avgSpeedKmh: 19.1, maxSpeedKmh: 40.2, avgHeartRate: 145, caloriesBurned: 920,
          elevationGainM: 355, effortRating: 6, powerWatts: 185, cadence: 80,
          recordedAt: new Date(now.getTime() - 72 * 60 * 60 * 1000)
        }
      ];
    }

    try {
      const rv = new RunView();

      // Load stats, riders, bikes, and locations in parallel for efficiency
      const [statsResult, ridersResult, bikesResult, locationsResult] = await rv.RunViews([
        {
          EntityName: ENTITY_NAMES.RIDER_STATS,
          OrderBy: 'recorded_at DESC',
          MaxRows: 10,
          ResultType: 'simple'
        },
        {
          EntityName: ENTITY_NAMES.RIDER,
          ResultType: 'simple'
        },
        {
          EntityName: ENTITY_NAMES.BIKE,
          ResultType: 'simple'
        },
        {
          EntityName: ENTITY_NAMES.LOCATION,
          ResultType: 'simple'
        }
      ]);

      if (!statsResult.Success || !statsResult.Results) {
        return [];
      }

      const stats = statsResult.Results as RiderStatsRecord[];
      const riders = (ridersResult.Success ? ridersResult.Results : []) as RiderRecord[];
      const bikes = (bikesResult.Success ? bikesResult.Results : []) as BikeRecord[];
      const locations = (locationsResult.Success ? locationsResult.Results : []) as LocationRecord[];

      // Create lookup maps
      const riderMap = new Map(riders.map(r => [r.rider_id, r]));
      const bikeMap = new Map(bikes.map(b => [b.bike_id, b]));
      const locationMap = new Map(locations.map(l => [l.location_id, l]));

      return stats.map(s => {
        const rider = riderMap.get(s.rider_id);
        const bike = s.bike_id ? bikeMap.get(s.bike_id) : null;
        const location = s.location_id ? locationMap.get(s.location_id) : null;

        return {
          id: s.stats_id,
          riderId: s.rider_id,
          riderName: rider?.username || 'Unknown Rider',
          bikeId: s.bike_id,
          bikeName: bike?.name || 'Unknown Bike',
          bikeType: bike?.bike_type || 'unknown',
          locationId: s.location_id,
          locationName: location?.name || 'Unknown Location',
          distanceKm: Math.round((s.distance_m || 0) / 1000 * 10) / 10,
          durationMinutes: Math.round((s.duration_seconds || 0) / 60),
          avgSpeedKmh: Math.round((s.avg_speed_mps || 0) * 3.6 * 10) / 10,
          maxSpeedKmh: Math.round((s.max_speed_mps || 0) * 3.6 * 10) / 10,
          avgHeartRate: s.avg_heart_rate_bpm || 0,
          caloriesBurned: s.calories_burned || 0,
          elevationGainM: s.elevation_gain_m || 0,
          effortRating: s.effort_rating || 5,
          powerWatts: s.power_watts || 0,
          cadence: s.cadence_rpm || 0,
          recordedAt: new Date(s.recorded_at)
        };
      });
    } catch (error) {
      console.error('Error loading recent rides:', error);
      return [];
    }
  }

  /**
   * Load top performers by aggregating rider stats
   */
  private async loadTopPerformers(): Promise<TopPerformer[]> {
    // Use sample data: top 5 performers
    if (USE_SAMPLE_DATA) {
      return [
        {
          riderId: 'r-007', username: 'Mike Thompson', email: 'mike.t@email.com',
          totalDistanceKm: 2850, totalRides: 48, avgSpeed: 27.2,
          totalCalories: 52400, totalElevation: 18500, fitnessLevel: 9, preferredTerrain: 'road'
        },
        {
          riderId: 'r-001', username: 'Alex Chen', email: 'alex.c@email.com',
          totalDistanceKm: 2420, totalRides: 52, avgSpeed: 25.8,
          totalCalories: 44800, totalElevation: 15200, fitnessLevel: 8, preferredTerrain: 'road'
        },
        {
          riderId: 'r-009', username: 'Chris Davis', email: 'chris.d@email.com',
          totalDistanceKm: 2180, totalRides: 28, avgSpeed: 21.5,
          totalCalories: 38900, totalElevation: 8500, fitnessLevel: 7, preferredTerrain: 'gravel'
        },
        {
          riderId: 'r-002', username: 'Maria Santos', email: 'maria.s@email.com',
          totalDistanceKm: 1850, totalRides: 62, avgSpeed: 14.2,
          totalCalories: 48200, totalElevation: 42000, fitnessLevel: 9, preferredTerrain: 'mountain'
        },
        {
          riderId: 'r-004', username: 'Emma Johnson', email: 'emma.j@email.com',
          totalDistanceKm: 1680, totalRides: 35, avgSpeed: 19.8,
          totalCalories: 32500, totalElevation: 12800, fitnessLevel: 7, preferredTerrain: 'gravel'
        }
      ];
    }

    try {
      const rv = new RunView();
      const [ridersResult, statsResult] = await rv.RunViews([
        {
          EntityName: ENTITY_NAMES.RIDER,
          ResultType: 'simple'
        },
        {
          EntityName: ENTITY_NAMES.RIDER_STATS,
          ResultType: 'simple'
        }
      ]);

      if (!ridersResult.Success || !statsResult.Success) {
        return [];
      }

      const riders = ridersResult.Results as RiderRecord[];
      const stats = statsResult.Results as RiderStatsRecord[];

      // Aggregate stats by rider
      const riderAggregates: Record<string, {
        totalDistance: number;
        rideCount: number;
        totalSpeed: number;
        totalCalories: number;
        totalElevation: number;
      }> = {};

      stats.forEach(s => {
        if (!riderAggregates[s.rider_id]) {
          riderAggregates[s.rider_id] = {
            totalDistance: 0,
            rideCount: 0,
            totalSpeed: 0,
            totalCalories: 0,
            totalElevation: 0
          };
        }
        riderAggregates[s.rider_id].totalDistance += s.distance_m || 0;
        riderAggregates[s.rider_id].rideCount += 1;
        riderAggregates[s.rider_id].totalSpeed += s.avg_speed_mps || 0;
        riderAggregates[s.rider_id].totalCalories += s.calories_burned || 0;
        riderAggregates[s.rider_id].totalElevation += s.elevation_gain_m || 0;
      });

      // Join with rider data and sort by total distance
      const topPerformers: TopPerformer[] = riders
        .filter(r => riderAggregates[r.rider_id])
        .map(r => {
          const agg = riderAggregates[r.rider_id];
          return {
            riderId: r.rider_id,
            username: r.username,
            email: r.email,
            totalDistanceKm: Math.round(agg.totalDistance / 1000),
            totalRides: agg.rideCount,
            avgSpeed: agg.rideCount > 0
              ? Math.round((agg.totalSpeed / agg.rideCount) * 3.6 * 10) / 10
              : 0,
            totalCalories: Math.round(agg.totalCalories),
            totalElevation: Math.round(agg.totalElevation),
            fitnessLevel: r.fitness_level || 5,
            preferredTerrain: r.preferred_terrain || 'mixed'
          };
        })
        .sort((a, b) => b.totalDistanceKm - a.totalDistanceKm)
        .slice(0, 5);

      return topPerformers;
    } catch (error) {
      console.error('Error loading top performers:', error);
      return [];
    }
  }

  /**
   * Load terrain distribution by joining stats with locations
   */
  private async loadTerrainDistribution(dateRange: { start: Date; end: Date }): Promise<TerrainDistribution[]> {
    const terrainColors: Record<string, string> = {
      road: '#3b82f6',
      urban: '#8b5cf6',
      mountain: '#10b981',
      gravel: '#f59e0b',
      singletrack: '#ef4444',
      doubletrack: '#ec4899',
      paved_trail: '#06b6d4',
      mixed: '#6366f1',
      unknown: '#6b7280'
    };

    // Use sample data matching SQL distribution: 30% road, 20% urban, 50% other
    if (USE_SAMPLE_DATA) {
      // Scale based on date range
      const rangeDays = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000));
      const scale = Math.min(1, rangeDays / 365);

      return [
        { terrain: 'road', rideCount: Math.round(150 * scale), totalDistanceKm: Math.round(3200 * scale), avgSpeed: 28.5, avgElevation: 180, avgEffort: 5.2, color: terrainColors['road'] },
        { terrain: 'urban', rideCount: Math.round(100 * scale), totalDistanceKm: Math.round(1450 * scale), avgSpeed: 22.8, avgElevation: 85, avgEffort: 4.5, color: terrainColors['urban'] },
        { terrain: 'mountain', rideCount: Math.round(75 * scale), totalDistanceKm: Math.round(1120 * scale), avgSpeed: 14.2, avgElevation: 620, avgEffort: 7.8, color: terrainColors['mountain'] },
        { terrain: 'gravel', rideCount: Math.round(75 * scale), totalDistanceKm: Math.round(1580 * scale), avgSpeed: 19.5, avgElevation: 320, avgEffort: 6.2, color: terrainColors['gravel'] },
        { terrain: 'paved_trail', rideCount: Math.round(50 * scale), totalDistanceKm: Math.round(680 * scale), avgSpeed: 24.2, avgElevation: 95, avgEffort: 4.0, color: terrainColors['paved_trail'] },
        { terrain: 'singletrack', rideCount: Math.round(30 * scale), totalDistanceKm: Math.round(380 * scale), avgSpeed: 12.8, avgElevation: 450, avgEffort: 8.2, color: terrainColors['singletrack'] },
        { terrain: 'mixed', rideCount: Math.round(20 * scale), totalDistanceKm: Math.round(340 * scale), avgSpeed: 20.5, avgElevation: 280, avgEffort: 5.8, color: terrainColors['mixed'] }
      ].filter(t => t.rideCount > 0);
    }

    try {
      const rv = new RunView();
      const [statsResult, locationsResult] = await rv.RunViews([
        {
          EntityName: ENTITY_NAMES.RIDER_STATS,
          ExtraFilter: `recorded_at >= '${dateRange.start.toISOString()}' AND recorded_at <= '${dateRange.end.toISOString()}'`,
          ResultType: 'simple'
        },
        {
          EntityName: ENTITY_NAMES.LOCATION,
          ResultType: 'simple'
        }
      ]);

      if (!statsResult.Success || !locationsResult.Success) {
        return [];
      }

      const stats = statsResult.Results as RiderStatsRecord[];
      const locations = locationsResult.Results as LocationRecord[];

      // Create location lookup
      const locationMap = new Map(locations.map(l => [l.location_id, l]));

      // Aggregate by terrain type
      const terrainAggregates: Record<string, {
        rideCount: number;
        totalDistance: number;
        totalSpeed: number;
        totalElevation: number;
        totalEffort: number;
      }> = {};

      stats.forEach(s => {
        const location = s.location_id ? locationMap.get(s.location_id) : null;
        const terrain = location?.terrain_type || 'unknown';

        if (!terrainAggregates[terrain]) {
          terrainAggregates[terrain] = {
            rideCount: 0,
            totalDistance: 0,
            totalSpeed: 0,
            totalElevation: 0,
            totalEffort: 0
          };
        }

        terrainAggregates[terrain].rideCount += 1;
        terrainAggregates[terrain].totalDistance += s.distance_m || 0;
        terrainAggregates[terrain].totalSpeed += s.avg_speed_mps || 0;
        terrainAggregates[terrain].totalElevation += s.elevation_gain_m || 0;
        terrainAggregates[terrain].totalEffort += s.effort_rating || 0;
      });

      return Object.entries(terrainAggregates)
        .map(([terrain, agg]) => ({
          terrain,
          rideCount: agg.rideCount,
          totalDistanceKm: Math.round(agg.totalDistance / 1000),
          avgSpeed: agg.rideCount > 0
            ? Math.round((agg.totalSpeed / agg.rideCount) * 3.6 * 10) / 10
            : 0,
          avgElevation: agg.rideCount > 0
            ? Math.round(agg.totalElevation / agg.rideCount)
            : 0,
          avgEffort: agg.rideCount > 0
            ? Math.round((agg.totalEffort / agg.rideCount) * 10) / 10
            : 0,
          color: terrainColors[terrain] || '#6b7280'
        }))
        .sort((a, b) => b.rideCount - a.rideCount);
    } catch (error) {
      console.error('Error loading terrain distribution:', error);
      return [];
    }
  }

  /**
   * Load time series data for activity chart
   */
  private async loadTimeSeriesData(dateRange: { start: Date; end: Date }): Promise<TimeSeriesDataPoint[]> {
    // Generate sample time series data for the date range
    if (USE_SAMPLE_DATA) {
      const data: TimeSeriesDataPoint[] = [];
      const startTime = dateRange.start.getTime();
      const endTime = dateRange.end.getTime();
      const dayMs = 24 * 60 * 60 * 1000;

      // Generate daily data points with realistic variation
      for (let time = startTime; time <= endTime; time += dayMs) {
        const date = new Date(time);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // More rides on weekends, with some random variation
        const baseRides = isWeekend ? 3 : 1.5;
        const rides = Math.max(0, Math.round(baseRides + (Math.random() - 0.3) * 2));

        if (rides > 0) {
          const avgDistancePerRide = 18 + Math.random() * 15; // 18-33 km per ride
          const avgCaloriesPerRide = 450 + Math.random() * 200; // 450-650 cal per ride
          const avgDurationPerRide = 0.8 + Math.random() * 0.6; // 0.8-1.4 hours per ride
          const avgSpeed = 22 + Math.random() * 10; // 22-32 km/h

          data.push({
            date,
            rides,
            distanceKm: Math.round(rides * avgDistancePerRide * 10) / 10,
            caloriesBurned: Math.round(rides * avgCaloriesPerRide),
            durationHours: Math.round(rides * avgDurationPerRide * 10) / 10,
            avgSpeed: Math.round(avgSpeed * 10) / 10
          });
        } else {
          data.push({
            date,
            rides: 0,
            distanceKm: 0,
            caloriesBurned: 0,
            durationHours: 0,
            avgSpeed: 0
          });
        }
      }

      return data;
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView<RiderStatsRecord>({
        EntityName: ENTITY_NAMES.RIDER_STATS,
        ExtraFilter: `recorded_at >= '${dateRange.start.toISOString()}' AND recorded_at <= '${dateRange.end.toISOString()}'`,
        OrderBy: 'recorded_at ASC',
        ResultType: 'simple'
      });

      if (!result.Success || !result.Results) {
        return [];
      }

      // Group by day
      const dailyData: Record<string, {
        rides: number;
        distance: number;
        calories: number;
        duration: number;
        speed: number;
      }> = {};

      result.Results.forEach(r => {
        const dateKey = new Date(r.recorded_at).toISOString().split('T')[0];
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = { rides: 0, distance: 0, calories: 0, duration: 0, speed: 0 };
        }
        dailyData[dateKey].rides += 1;
        dailyData[dateKey].distance += r.distance_m || 0;
        dailyData[dateKey].calories += r.calories_burned || 0;
        dailyData[dateKey].duration += r.duration_seconds || 0;
        dailyData[dateKey].speed += r.avg_speed_mps || 0;
      });

      return Object.entries(dailyData)
        .map(([dateStr, data]) => ({
          date: new Date(dateStr),
          rides: data.rides,
          distanceKm: Math.round(data.distance / 1000 * 10) / 10,
          caloriesBurned: Math.round(data.calories),
          durationHours: Math.round(data.duration / 3600 * 10) / 10,
          avgSpeed: data.rides > 0
            ? Math.round((data.speed / data.rides) * 3.6 * 10) / 10
            : 0
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (error) {
      console.error('Error loading time series data:', error);
      return [];
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
