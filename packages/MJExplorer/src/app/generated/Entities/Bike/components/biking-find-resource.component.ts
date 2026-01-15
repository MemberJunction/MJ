import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView, Metadata } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Tree-shaking prevention function
 */
export function LoadBikingFindResource() {
  // Force inclusion in production builds
}

interface RiderSearchResult {
  rider_id: string;
  username: string;
  email: string;
  FirstName: string | null;
  LastName: string | null;
  fitness_level: number | null;
  preferred_terrain: string | null;
  created_at: Date;
}

interface RideSearchResult {
  stats_id: string;
  rider_id: string;
  recorded_at: Date;
  distance_m: number;
  duration_seconds: number;
  avg_speed_mps: number | null;
  elevation_gain_m: number | null;
  location_id_Virtual: string | null;
  bike_id_Virtual: string | null;
}

/**
 * Biking Find Resource - Search for riders and rides, add new records
 */
@RegisterClass(BaseResourceComponent, 'BikingFindResource')
@Component({
  selector: 'mj-biking-find-resource',
  template: `
    <div class="resource-container">
      <!-- Header -->
      <div class="header">
        <h2><i class="fa-solid fa-magnifying-glass"></i> Find</h2>
        <p>Search for riders and rides, or add new records to the database</p>
      </div>

      <!-- Search Type Selector -->
      <div class="search-type-selector">
        <button
          [class.active]="searchType === 'riders'"
          (click)="setSearchType('riders')"
          class="type-button">
          <i class="fa-solid fa-user"></i> Riders
        </button>
        <button
          [class.active]="searchType === 'rides'"
          (click)="setSearchType('rides')"
          class="type-button">
          <i class="fa-solid fa-route"></i> Rides
        </button>
      </div>

      <!-- Search Bar -->
      <div class="search-bar">
        <input
          type="text"
          [(ngModel)]="searchTerm"
          (input)="onSearchChange()"
          [placeholder]="searchType === 'riders' ? 'Search riders by name, username, or email...' : 'Search rides by location or bike...'"
          class="search-input">
        <button (click)="onSearchChange()" class="search-button">
          <i class="fa-solid fa-search"></i> Search
        </button>
        <button (click)="openAddDialog()" class="add-button">
          <i class="fa-solid fa-plus"></i> Add {{ searchType === 'riders' ? 'Rider' : 'Ride' }}
        </button>
      </div>

      <!-- Loading State -->
      <div *ngIf="isLoading" class="loading-container">
        <mj-loading text="Searching..."></mj-loading>
      </div>

      <!-- Results -->
      <div *ngIf="!isLoading" class="results-container">
        <!-- Riders Results -->
        <div *ngIf="searchType === 'riders'" class="results-section">
          <div class="results-header">
            <h3>{{ filteredRiders.length }} rider(s) found</h3>
          </div>
          <div *ngIf="filteredRiders.length === 0" class="no-results">
            <i class="fa-solid fa-user-slash"></i>
            <p>No riders found. Try a different search term or add a new rider.</p>
          </div>
          <div class="results-grid" *ngIf="filteredRiders.length > 0">
            <div *ngFor="let rider of filteredRiders" class="result-card rider-card">
              <div class="card-header">
                <div class="card-icon">
                  <i class="fa-solid fa-user"></i>
                </div>
                <div class="card-title">
                  <h4>{{ rider.FirstName && rider.LastName ? rider.FirstName + ' ' + rider.LastName : rider.username }}</h4>
                  <span class="card-subtitle">{{ '@' + rider.username }}</span>
                </div>
              </div>
              <div class="card-body">
                <div class="card-field">
                  <label>Email:</label>
                  <span>{{ rider.email }}</span>
                </div>
                <div class="card-field" *ngIf="rider.fitness_level">
                  <label>Fitness Level:</label>
                  <span>{{ rider.fitness_level }}/10</span>
                </div>
                <div class="card-field" *ngIf="rider.preferred_terrain">
                  <label>Preferred Terrain:</label>
                  <span class="terrain-badge">{{ rider.preferred_terrain }}</span>
                </div>
                <div class="card-field">
                  <label>Joined:</label>
                  <span>{{ formatDate(rider.created_at) }}</span>
                </div>
              </div>
              <div class="card-actions">
                <button (click)="viewRiderDetails(rider)" class="action-button">
                  <i class="fa-solid fa-eye"></i> View Details
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Rides Results -->
        <div *ngIf="searchType === 'rides'" class="results-section">
          <div class="results-header">
            <h3>{{ filteredRides.length }} ride(s) found</h3>
          </div>
          <div *ngIf="filteredRides.length === 0" class="no-results">
            <i class="fa-solid fa-route"></i>
            <p>No rides found. Try a different search term or add a new ride.</p>
          </div>
          <div class="results-grid" *ngIf="filteredRides.length > 0">
            <div *ngFor="let ride of filteredRides" class="result-card ride-card">
              <div class="card-header">
                <div class="card-icon">
                  <i class="fa-solid fa-route"></i>
                </div>
                <div class="card-title">
                  <h4>{{ ride.location_id_Virtual || 'Unknown Location' }}</h4>
                  <span class="card-subtitle">{{ formatDate(ride.recorded_at) }}</span>
                </div>
              </div>
              <div class="card-body">
                <div class="card-field">
                  <label>Bike:</label>
                  <span>{{ ride.bike_id_Virtual || 'Not specified' }}</span>
                </div>
                <div class="card-field">
                  <label>Distance:</label>
                  <span>{{ formatDistance(ride.distance_m) }}</span>
                </div>
                <div class="card-field">
                  <label>Duration:</label>
                  <span>{{ formatDuration(ride.duration_seconds) }}</span>
                </div>
                <div class="card-field" *ngIf="ride.avg_speed_mps">
                  <label>Avg Speed:</label>
                  <span>{{ formatSpeed(ride.avg_speed_mps) }}</span>
                </div>
                <div class="card-field" *ngIf="ride.elevation_gain_m">
                  <label>Elevation Gain:</label>
                  <span>{{ ride.elevation_gain_m }} m</span>
                </div>
              </div>
              <div class="card-actions">
                <button (click)="viewRideDetails(ride)" class="action-button">
                  <i class="fa-solid fa-eye"></i> View Details
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 2rem;
      box-sizing: border-box;
      background: #f8fafc;
    }

    .header {
      margin-bottom: 2rem;
    }

    .header h2 {
      margin: 0 0 0.5rem 0;
      color: #1e293b;
      font-size: 1.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .header p {
      margin: 0;
      color: #64748b;
    }

    .search-type-selector {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .type-button {
      padding: 0.75rem 1.5rem;
      border: 2px solid #e2e8f0;
      background: white;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 1rem;
      font-weight: 500;
      color: #64748b;
    }

    .type-button:hover {
      border-color: #059669;
      color: #059669;
    }

    .type-button.active {
      border-color: #059669;
      background: #059669;
      color: white;
    }

    .search-bar {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .search-input {
      flex: 1;
      padding: 0.75rem 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      outline: none;
      border-color: #059669;
    }

    .search-button,
    .add-button {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .search-button {
      background: #059669;
      color: white;
    }

    .search-button:hover {
      background: #047857;
    }

    .add-button {
      background: #0ea5e9;
      color: white;
    }

    .add-button:hover {
      background: #0284c7;
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 400px;
    }

    .results-container {
      animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .results-header {
      margin-bottom: 1rem;
    }

    .results-header h3 {
      margin: 0;
      color: #1e293b;
      font-size: 1.25rem;
    }

    .no-results {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }

    .no-results i {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .result-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.5rem;
      transition: all 0.2s;
    }

    .result-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      border-color: #059669;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #f1f5f9;
    }

    .card-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
    }

    .rider-card .card-icon {
      background: #dcfce7;
      color: #059669;
    }

    .ride-card .card-icon {
      background: #dbeafe;
      color: #0ea5e9;
    }

    .card-title h4 {
      margin: 0;
      font-size: 1.125rem;
      color: #1e293b;
    }

    .card-subtitle {
      font-size: 0.875rem;
      color: #64748b;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .card-field {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.875rem;
    }

    .card-field label {
      font-weight: 600;
      color: #64748b;
    }

    .card-field span {
      color: #1e293b;
    }

    .terrain-badge {
      background: #f1f5f9;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      text-transform: capitalize;
    }

    .card-actions {
      display: flex;
      gap: 0.5rem;
      padding-top: 1rem;
      border-top: 1px solid #f1f5f9;
    }

    .action-button {
      flex: 1;
      padding: 0.5rem 1rem;
      border: 1px solid #e2e8f0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      color: #059669;
      transition: all 0.2s;
    }

    .action-button:hover {
      background: #f0fdf4;
      border-color: #059669;
    }
  `]
})
export class BikingFindResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  searchType: 'riders' | 'rides' = 'riders';
  searchTerm = '';
  isLoading = false;

  allRiders: RiderSearchResult[] = [];
  allRides: RideSearchResult[] = [];
  filteredRiders: RiderSearchResult[] = [];
  filteredRides: RideSearchResult[] = [];

  private destroy$ = new Subject<void>();

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const rv = new RunView();

      // Load all riders
      const ridersResult = await rv.RunView<RiderSearchResult>({
        EntityName: 'Riders',
        ResultType: 'simple',
        OrderBy: 'created_at DESC'
      });

      if (ridersResult.Success) {
        this.allRiders = ridersResult.Results || [];
        this.filteredRiders = this.allRiders;
      }

      // Load all rides
      const ridesResult = await rv.RunView<RideSearchResult>({
        EntityName: 'Rider _ Stats',
        ResultType: 'simple',
        OrderBy: 'recorded_at DESC'
      });

      if (ridesResult.Success) {
        this.allRides = ridesResult.Results || [];
        this.filteredRides = this.allRides;
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  setSearchType(type: 'riders' | 'rides'): void {
    this.searchType = type;
    this.searchTerm = '';
    this.onSearchChange();
  }

  onSearchChange(): void {
    const term = this.searchTerm.toLowerCase().trim();

    if (this.searchType === 'riders') {
      if (!term) {
        this.filteredRiders = this.allRiders;
      } else {
        this.filteredRiders = this.allRiders.filter(rider =>
          rider.username.toLowerCase().includes(term) ||
          rider.email.toLowerCase().includes(term) ||
          (rider.FirstName && rider.FirstName.toLowerCase().includes(term)) ||
          (rider.LastName && rider.LastName.toLowerCase().includes(term)) ||
          (rider.preferred_terrain && rider.preferred_terrain.toLowerCase().includes(term))
        );
      }
    } else {
      if (!term) {
        this.filteredRides = this.allRides;
      } else {
        this.filteredRides = this.allRides.filter(ride =>
          (ride.location_id_Virtual && ride.location_id_Virtual.toLowerCase().includes(term)) ||
          (ride.bike_id_Virtual && ride.bike_id_Virtual.toLowerCase().includes(term))
        );
      }
    }

    this.cdr.detectChanges();
  }

  openAddDialog(): void {
    // TODO: Implement dialog for adding riders/rides
    alert(`Add ${this.searchType === 'riders' ? 'Rider' : 'Ride'} dialog coming soon!`);
  }

  viewRiderDetails(rider: RiderSearchResult): void {
    // TODO: Navigate to rider details view
    console.log('View rider details:', rider);
    alert(`Viewing details for ${rider.username}`);
  }

  viewRideDetails(ride: RideSearchResult): void {
    // TODO: Navigate to ride details view
    console.log('View ride details:', ride);
    alert(`Viewing ride details`);
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatDistance(meters: number): string {
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  formatSpeed(mps: number): string {
    const kmh = mps * 3.6;
    return `${kmh.toFixed(1)} km/h`;
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Find';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-magnifying-glass';
  }
}
