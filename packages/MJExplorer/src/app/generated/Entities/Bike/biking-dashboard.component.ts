import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  BikingInstrumentationService,
  RiderStats,
  BikeStats,
  RideMetrics,
  LocationStats,
  WeatherSnapshot,
  RecentRide,
  TopPerformer,
  TerrainDistribution,
  TimeSeriesDataPoint
} from './services/biking-instrumentation.service';

export interface KPICardData {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
    period: string;
  };
  loading?: boolean;
}

/**
 * Trailbloom Biking Dashboard - A world-class cycling analytics experience
 * Connected to MJ_Biking_App database tables:
 * - Rider: cyclist profiles and preferences
 * - Bike: bicycles owned by riders
 * - Location: geographic points of interest
 * - Weather: weather condition snapshots
 * - Rider_Stats: performance metrics and physiological data
 */
@Component({
  selector: 'app-biking-dashboard',
  templateUrl: './biking-dashboard.component.html',
  styleUrls: ['./biking-dashboard.component.css']
})
export class BikingDashboardComponent implements AfterViewInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Loading states
  isLoading = true;
  isRefreshing = false;

  // Data from database
  riderStats: RiderStats | null = null;
  bikeStats: BikeStats | null = null;
  rideMetrics: RideMetrics | null = null;
  locationStats: LocationStats | null = null;
  weatherSnapshot: WeatherSnapshot | null = null;
  recentRides: RecentRide[] = [];
  topPerformers: TopPerformer[] = [];
  terrainDistribution: TerrainDistribution[] = [];
  timeSeriesData: TimeSeriesDataPoint[] = [];

  // Date range
  dateRange: { start: Date; end: Date } = {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date()
  };

  // View state
  activeTab: 'overview' | 'rides' | 'locations' | 'performance' = 'overview';
  selectedTimeRange: '7d' | '30d' | '90d' | '1y' = '30d';

  constructor(
    private bikingService: BikingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngAfterViewInit(): void {
    this.subscribeToData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private subscribeToData(): void {
    // Subscribe to loading state
    this.bikingService.isLoading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        this.isLoading = loading;
        this.cdr.detectChanges();
      });

    // Subscribe to all data streams
    combineLatest([
      this.bikingService.riderStats$,
      this.bikingService.bikeStats$,
      this.bikingService.rideMetrics$,
      this.bikingService.locationStats$,
      this.bikingService.weatherSnapshot$
    ]).pipe(takeUntil(this.destroy$))
      .subscribe(([riders, bikes, metrics, locations, weather]) => {
        this.riderStats = riders;
        this.bikeStats = bikes;
        this.rideMetrics = metrics;
        this.locationStats = locations;
        this.weatherSnapshot = weather;
        this.cdr.detectChanges();
      });

    this.bikingService.recentRides$
      .pipe(takeUntil(this.destroy$))
      .subscribe(rides => {
        this.recentRides = rides;
        this.cdr.detectChanges();
      });

    this.bikingService.topPerformers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(performers => {
        this.topPerformers = performers;
        this.cdr.detectChanges();
      });

    this.bikingService.terrainDistribution$
      .pipe(takeUntil(this.destroy$))
      .subscribe(terrain => {
        this.terrainDistribution = terrain;
        this.isLoading = false;
        this.isRefreshing = false;
        this.cdr.detectChanges();
      });

    this.bikingService.timeSeriesData$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.timeSeriesData = data;
        this.cdr.detectChanges();
      });
  }

  /**
   * Refresh all dashboard data
   */
  refresh(): void {
    this.isRefreshing = true;
    this.bikingService.refresh();
  }

  /**
   * Change time range filter
   */
  setTimeRange(range: '7d' | '30d' | '90d' | '1y'): void {
    this.selectedTimeRange = range;
    const now = new Date();
    let start: Date;

    switch (range) {
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    this.dateRange = { start, end: now };
    this.bikingService.setDateRange(start, now);
  }

  /**
   * Format large numbers with K/M suffix
   */
  formatNumber(value: number): string {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  }

  /**
   * Format duration in hours/minutes
   */
  formatDuration(minutes: number): string {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Get relative time string
   */
  getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  /**
   * Get weather icon based on precipitation_type from Weather table
   */
  getWeatherIcon(condition: string): string {
    const icons: Record<string, string> = {
      none: 'fa-sun',
      drizzle: 'fa-cloud-rain',
      rain: 'fa-cloud-showers-heavy',
      heavy_rain: 'fa-cloud-showers-water',
      snow: 'fa-snowflake',
      sleet: 'fa-cloud-meatball',
      hail: 'fa-cloud-hail',
      fog: 'fa-smog'
    };
    return icons[condition] || 'fa-cloud';
  }

  /**
   * Get terrain icon based on terrain_type from Location table
   */
  getTerrainIcon(terrain: string): string {
    const icons: Record<string, string> = {
      road: 'fa-road',
      urban: 'fa-city',
      mountain: 'fa-mountain',
      gravel: 'fa-hashtag',
      singletrack: 'fa-shoe-prints',
      doubletrack: 'fa-tire',
      paved_trail: 'fa-tree',
      mixed: 'fa-shuffle',
      unknown: 'fa-location-dot'
    };
    return icons[terrain] || 'fa-location-dot';
  }

  /**
   * Get bike type icon based on bike_type from Bike table
   */
  getBikeTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      road: 'fa-bicycle',
      mountain: 'fa-mountain',
      gravel: 'fa-road',
      hybrid: 'fa-bicycle',
      electric: 'fa-bolt',
      bmx: 'fa-person-biking',
      touring: 'fa-suitcase-rolling',
      cyclocross: 'fa-flag-checkered',
      unknown: 'fa-bicycle'
    };
    return icons[type] || 'fa-bicycle';
  }

  /**
   * Get surface condition icon based on surface_condition from Location table
   */
  getSurfaceIcon(surface: string): string {
    const icons: Record<string, string> = {
      dry: 'fa-sun',
      wet: 'fa-droplet',
      muddy: 'fa-water',
      icy: 'fa-snowflake',
      sandy: 'fa-umbrella-beach',
      loose: 'fa-circle-nodes',
      packed: 'fa-compress',
      unknown: 'fa-question'
    };
    return icons[surface] || 'fa-question';
  }

  /**
   * Get effort rating color based on effort_rating from Rider_Stats (1-10)
   */
  getEffortColor(rating: number): string {
    if (rating <= 3) return '#10b981'; // Easy - green
    if (rating <= 5) return '#3b82f6'; // Moderate - blue
    if (rating <= 7) return '#f59e0b'; // Hard - amber
    return '#ef4444'; // Very hard - red
  }

  /**
   * Get effort label
   */
  getEffortLabel(rating: number): string {
    if (rating <= 3) return 'Easy';
    if (rating <= 5) return 'Moderate';
    if (rating <= 7) return 'Hard';
    return 'Intense';
  }

  /**
   * Get fitness level color based on fitness_level from Rider (1-10)
   */
  getFitnessColor(level: number): string {
    if (level <= 3) return '#ef4444'; // Beginner - red
    if (level <= 5) return '#f59e0b'; // Intermediate - amber
    if (level <= 7) return '#3b82f6'; // Advanced - blue
    return '#10b981'; // Elite - green
  }

  /**
   * Get difficulty rating color based on difficulty_rating from Location (1.0-10.0)
   */
  getDifficultyColor(rating: number): string {
    if (rating <= 3) return '#10b981'; // Easy - green
    if (rating <= 5) return '#3b82f6'; // Moderate - blue
    if (rating <= 7) return '#f59e0b'; // Challenging - amber
    return '#ef4444'; // Expert - red
  }

  /**
   * Calculate max value for chart scaling
   */
  getMaxTimeSeriesValue(key: 'rides' | 'distanceKm' | 'caloriesBurned'): number {
    if (this.timeSeriesData.length === 0) return 100;
    return Math.max(...this.timeSeriesData.map(d => d[key])) * 1.1;
  }

  /**
   * Get bar height percentage for time series
   */
  getBarHeight(value: number, max: number): number {
    return max > 0 ? (value / max) * 100 : 0;
  }

  /**
   * Convert m/s to km/h
   */
  mpsToKmh(mps: number): number {
    return Math.round(mps * 3.6 * 10) / 10;
  }

  /**
   * Convert meters to kilometers
   */
  metersToKm(meters: number): number {
    return Math.round(meters / 1000 * 10) / 10;
  }

  /**
   * Convert seconds to formatted duration string
   */
  secondsToFormatted(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Get greeting based on time of day
   */
  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /**
   * Get current date formatted
   */
  get formattedDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Get preferred terrain display name
   */
  getTerrainDisplayName(terrain: string): string {
    const names: Record<string, string> = {
      road: 'Road',
      gravel: 'Gravel',
      mountain: 'Mountain',
      urban: 'Urban',
      mixed: 'Mixed',
      singletrack: 'Singletrack',
      doubletrack: 'Doubletrack',
      paved_trail: 'Paved Trail',
      unknown: 'Unknown'
    };
    return names[terrain] || terrain;
  }
}

/**
 * Tree-shaking prevention function
 */
export function LoadBikingDashboard(): void {
  // Force inclusion in production builds
}
