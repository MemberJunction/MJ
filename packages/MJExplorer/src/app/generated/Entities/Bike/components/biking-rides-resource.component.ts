import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BikingInstrumentationService, RecentRide } from '../services/biking-instrumentation.service';

/**
 * Tree-shaking prevention function
 */
export function LoadBikingRidesResource() {
  // Force inclusion in production builds
}

/**
 * Biking Rides Resource - View and manage cycling rides
 */
@RegisterClass(BaseResourceComponent, 'BikingRidesResource')
@Component({
  selector: 'mj-biking-rides-resource',
  template: `
    <div class="resource-container">
      <div class="rides-header">
        <h2><i class="fa-solid fa-route"></i> Recent Rides</h2>
        <button class="refresh-btn" (click)="refresh()">
          <i class="fa-solid fa-arrows-rotate"></i> Refresh
        </button>
      </div>

      <div class="rides-grid" *ngIf="rides.length > 0">
        <div class="ride-card" *ngFor="let ride of rides">
          <div class="ride-card-header">
            <div class="rider-info">
              <div class="rider-avatar">
                <i class="fa-solid fa-user"></i>
              </div>
              <div class="rider-details">
                <span class="rider-name">{{ ride.riderName }}</span>
                <span class="ride-time">{{ getRelativeTime(ride.recordedAt) }}</span>
              </div>
            </div>
            <div class="effort-badge" [style.background]="getEffortColor(ride.effortRating)">
              {{ ride.effortRating }}/10
            </div>
          </div>

          <div class="ride-location">
            <i class="fa-solid fa-location-dot"></i>
            {{ ride.locationName }}
          </div>

          <div class="ride-stats-grid">
            <div class="stat-item">
              <i class="fa-solid fa-road"></i>
              <span class="stat-value">{{ ride.distanceKm }}</span>
              <span class="stat-label">km</span>
            </div>
            <div class="stat-item">
              <i class="fa-solid fa-gauge"></i>
              <span class="stat-value">{{ ride.avgSpeedKmh }}</span>
              <span class="stat-label">km/h avg</span>
            </div>
            <div class="stat-item">
              <i class="fa-solid fa-clock"></i>
              <span class="stat-value">{{ formatDuration(ride.durationMinutes) }}</span>
              <span class="stat-label">duration</span>
            </div>
            <div class="stat-item">
              <i class="fa-solid fa-fire"></i>
              <span class="stat-value">{{ ride.caloriesBurned }}</span>
              <span class="stat-label">cal</span>
            </div>
            <div class="stat-item">
              <i class="fa-solid fa-heart-pulse"></i>
              <span class="stat-value">{{ ride.avgHeartRate }}</span>
              <span class="stat-label">bpm</span>
            </div>
            <div class="stat-item">
              <i class="fa-solid fa-mountain"></i>
              <span class="stat-value">{{ ride.elevationGainM }}</span>
              <span class="stat-label">m elev</span>
            </div>
          </div>

          <div class="ride-bike">
            <i [class]="'fa-solid ' + getBikeTypeIcon(ride.bikeType)"></i>
            {{ ride.bikeName }} <span class="bike-type">({{ ride.bikeType }})</span>
          </div>

          <div class="ride-details-row">
            <span class="detail"><i class="fa-solid fa-bolt"></i> {{ ride.powerWatts }}W</span>
            <span class="detail"><i class="fa-solid fa-gauge-high"></i> {{ ride.maxSpeedKmh }} km/h max</span>
            <span class="detail"><i class="fa-solid fa-rotate"></i> {{ ride.cadence }} rpm</span>
          </div>
        </div>
      </div>

      <div class="empty-state" *ngIf="rides.length === 0 && !isLoading">
        <i class="fa-solid fa-bicycle"></i>
        <p>No rides recorded yet</p>
      </div>

      <div class="loading-state" *ngIf="isLoading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Loading rides...</p>
      </div>
    </div>
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
      padding: 1.5rem;
      background: #f8fafc;
    }

    .rides-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .rides-header h2 {
      margin: 0;
      color: #1e293b;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .rides-header h2 i {
      color: #059669;
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border: none;
      background: #059669;
      color: white;
      border-radius: 0.5rem;
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.2s;
    }

    .refresh-btn:hover {
      background: #047857;
    }

    .rides-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 1rem;
    }

    .ride-card {
      background: white;
      border-radius: 0.75rem;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid #e2e8f0;
    }

    .ride-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .rider-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .rider-avatar {
      width: 40px;
      height: 40px;
      background: #e2e8f0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
    }

    .rider-details {
      display: flex;
      flex-direction: column;
    }

    .rider-name {
      font-weight: 600;
      color: #1e293b;
    }

    .ride-time {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .effort-badge {
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      color: white;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .ride-location {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #64748b;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #f1f5f9;
    }

    .ride-location i {
      color: #059669;
    }

    .ride-stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.5rem;
      background: #f8fafc;
      border-radius: 0.5rem;
    }

    .stat-item i {
      color: #059669;
      margin-bottom: 0.25rem;
    }

    .stat-value {
      font-weight: 600;
      color: #1e293b;
      font-size: 1rem;
    }

    .stat-label {
      font-size: 0.7rem;
      color: #94a3b8;
    }

    .ride-bike {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: #f1f5f9;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: #475569;
      margin-bottom: 0.75rem;
    }

    .ride-bike i {
      color: #059669;
    }

    .bike-type {
      color: #94a3b8;
      font-size: 0.75rem;
    }

    .ride-details-row {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .detail {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: #64748b;
    }

    .detail i {
      color: #94a3b8;
    }

    .empty-state, .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 300px;
      color: #94a3b8;
    }

    .empty-state i, .loading-state i {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
  `]
})
export class BikingRidesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  rides: RecentRide[] = [];
  isLoading = true;

  constructor(
    private bikingService: BikingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    this.bikingService.recentRides$
      .pipe(takeUntil(this.destroy$))
      .subscribe(rides => {
        this.rides = rides;
        this.isLoading = false;
        this.cdr.detectChanges();
        this.NotifyLoadComplete();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh(): void {
    this.isLoading = true;
    this.bikingService.refresh();
  }

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

  formatDuration(minutes: number): string {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    }
    return `${minutes}m`;
  }

  getEffortColor(rating: number): string {
    if (rating <= 3) return '#10b981';
    if (rating <= 5) return '#3b82f6';
    if (rating <= 7) return '#f59e0b';
    return '#ef4444';
  }

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

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Rides';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-route';
  }
}
