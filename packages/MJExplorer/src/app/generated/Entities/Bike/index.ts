// Trailbloom Biking Dashboard - Public API
// Connected to MJ_Biking_App database tables

// Module
export { BikingModule, LoadBikingModule } from './biking.module';

// Dashboard Components
export { BikingDashboardComponent, LoadBikingDashboard } from './biking-dashboard.component';

// Resource Components
export {
  BikingDashboardResourceComponent,
  LoadBikingDashboardResource,
  BikingRidesResourceComponent,
  LoadBikingRidesResource,
  BikingLocationsResourceComponent,
  LoadBikingLocationsResource,
  BikingFleetResourceComponent,
  LoadBikingFleetResource
} from './components';

// Services and Interfaces
export {
  BikingInstrumentationService,
  // Database record interfaces (matching MJ_Biking_App schema)
  RiderRecord,
  BikeRecord,
  LocationRecord,
  WeatherRecord,
  RiderStatsRecord,
  // Dashboard display interfaces
  RiderStats,
  BikeStats,
  RideMetrics,
  LocationStats,
  WeatherSnapshot,
  RecentRide,
  TopPerformer,
  TerrainDistribution,
  TimeSeriesDataPoint,
  MapLocation,
  PopularRoute
} from './services/biking-instrumentation.service';
