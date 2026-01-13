import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BikingInstrumentationService, LocationStats, MapLocation, PopularRoute } from '../services/biking-instrumentation.service';

/**
 * Tree-shaking prevention function
 */
export function LoadBikingLocationsResource() {
  // Force inclusion in production builds
}

/**
 * Biking Locations Resource - Interactive map view of cycling locations and routes
 */
@RegisterClass(BaseResourceComponent, 'BikingLocationsResource')
@Component({
  selector: 'mj-biking-locations-resource',
  template: `
    <div class="resource-container">
      <div class="locations-header">
        <h2><i class="fa-solid fa-map-location-dot"></i> Locations Map</h2>
        <button class="refresh-btn" (click)="refresh()">
          <i class="fa-solid fa-arrows-rotate"></i> Refresh
        </button>
      </div>

      <div class="locations-layout" *ngIf="locationStats && !isLoading">
        <!-- Main Map Area -->
        <div class="map-section">
          <div class="map-container">
            <!-- Simulated Map Grid -->
            <div class="map-grid">
              <!-- Location Markers -->
              <div class="map-marker"
                   *ngFor="let loc of locationStats.mapLocations"
                   [style.left.%]="getMapX(loc)"
                   [style.top.%]="getMapY(loc)"
                   [style.background]="getTerrainColor(loc.terrain)"
                   [class.selected]="selectedLocation?.id === loc.id"
                   (click)="selectLocation(loc)"
                   [title]="loc.name">
                <i [class]="'fa-solid ' + getTerrainIcon(loc.terrain)"></i>
                <div class="marker-pulse" [style.border-color]="getTerrainColor(loc.terrain)"></div>
              </div>

              <!-- Map Labels for Top Locations -->
              <div class="map-label"
                   *ngFor="let loc of getTopLocations()"
                   [style.left.%]="getMapX(loc)"
                   [style.top.%]="getMapY(loc) + 5">
                {{ loc.name }}
              </div>

              <!-- Compass Rose -->
              <div class="compass">
                <div class="compass-n">N</div>
                <i class="fa-solid fa-compass"></i>
              </div>

              <!-- Scale Bar -->
              <div class="scale-bar">
                <div class="scale-line"></div>
                <span>5 km</span>
              </div>
            </div>

            <!-- Selected Location Detail -->
            <div class="location-detail-panel" *ngIf="selectedLocation">
              <div class="detail-header">
                <div class="detail-icon" [style.background]="getTerrainColor(selectedLocation.terrain) + '20'" [style.color]="getTerrainColor(selectedLocation.terrain)">
                  <i [class]="'fa-solid ' + getTerrainIcon(selectedLocation.terrain)"></i>
                </div>
                <div class="detail-title">
                  <h3>{{ selectedLocation.name }}</h3>
                  <span class="terrain-type">{{ getTerrainDisplayName(selectedLocation.terrain) }}</span>
                </div>
                <button class="close-btn" (click)="selectedLocation = null">
                  <i class="fa-solid fa-times"></i>
                </button>
              </div>
              <div class="detail-stats">
                <div class="stat">
                  <i class="fa-solid fa-mountain"></i>
                  <span>{{ selectedLocation.elevation }}m</span>
                  <label>Elevation</label>
                </div>
                <div class="stat">
                  <i class="fa-solid fa-star"></i>
                  <span>{{ selectedLocation.difficulty }}/10</span>
                  <label>Difficulty</label>
                </div>
                <div class="stat">
                  <i class="fa-solid fa-eye"></i>
                  <span>{{ selectedLocation.visitCount }}</span>
                  <label>Visits</label>
                </div>
                <div class="stat">
                  <i class="fa-solid fa-road"></i>
                  <span>{{ selectedLocation.surface }}</span>
                  <label>Surface</label>
                </div>
              </div>
              <div class="detail-coords">
                <i class="fa-solid fa-location-crosshairs"></i>
                {{ selectedLocation.latitude.toFixed(4) }}, {{ selectedLocation.longitude.toFixed(4) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="sidebar">
          <!-- Terrain Legend -->
          <div class="legend-card">
            <h3><i class="fa-solid fa-layer-group"></i> Terrain Types</h3>
            <div class="legend-items">
              <div class="legend-item" *ngFor="let terrain of locationStats.locationsByTerrain"
                   (click)="filterByTerrain(terrain.terrain)"
                   [class.active]="activeTerrain === terrain.terrain">
                <div class="legend-icon" [style.background]="getTerrainColor(terrain.terrain)">
                  <i [class]="'fa-solid ' + getTerrainIcon(terrain.terrain)"></i>
                </div>
                <span class="legend-name">{{ getTerrainDisplayName(terrain.terrain) }}</span>
                <span class="legend-count">{{ terrain.count }}</span>
              </div>
            </div>
            <button class="clear-filter-btn" *ngIf="activeTerrain" (click)="clearFilter()">
              <i class="fa-solid fa-times"></i> Clear Filter
            </button>
          </div>

          <!-- Popular Routes -->
          <div class="routes-card">
            <h3><i class="fa-solid fa-route"></i> Popular Routes</h3>
            <div class="routes-list">
              <div class="route-item" *ngFor="let route of locationStats.popularRoutes; let i = index">
                <div class="route-rank">{{ i + 1 }}</div>
                <div class="route-info">
                  <div class="route-name">{{ route.name }}</div>
                  <div class="route-meta">
                    <span class="route-terrain" [style.color]="getTerrainColor(route.terrain)">
                      <i [class]="'fa-solid ' + getTerrainIcon(route.terrain)"></i>
                      {{ getTerrainDisplayName(route.terrain) }}
                    </span>
                  </div>
                  <div class="route-stats">
                    <span><i class="fa-solid fa-road"></i> {{ route.totalDistanceKm.toFixed(1) }} km</span>
                    <span><i class="fa-solid fa-mountain"></i> {{ route.elevationGainM.toFixed(0) }}m</span>
                    <span><i class="fa-solid fa-gauge"></i> {{ route.avgSpeedKmh.toFixed(1) }} km/h</span>
                  </div>
                </div>
                <div class="route-visits">
                  <span class="visits-count">{{ route.visitCount }}</span>
                  <span class="visits-label">rides</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="stats-card">
            <h3><i class="fa-solid fa-chart-simple"></i> Overview</h3>
            <div class="quick-stats">
              <div class="quick-stat">
                <span class="stat-value">{{ locationStats.totalLocations }}</span>
                <span class="stat-label">Locations</span>
              </div>
              <div class="quick-stat">
                <span class="stat-value">{{ locationStats.avgElevation }}m</span>
                <span class="stat-label">Avg Elevation</span>
              </div>
              <div class="quick-stat">
                <span class="stat-value">{{ locationStats.avgDifficultyRating }}/10</span>
                <span class="stat-label">Avg Difficulty</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="loading-state" *ngIf="isLoading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Loading locations...</p>
      </div>
    </div>
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: hidden;
      box-sizing: border-box;
      padding: 1.5rem;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
    }

    .locations-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      flex-shrink: 0;
    }

    .locations-header h2 {
      margin: 0;
      color: #1e293b;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .locations-header h2 i {
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

    .locations-layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 1rem;
      flex: 1;
      min-height: 0;
    }

    .map-section {
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid #e2e8f0;
      overflow: hidden;
    }

    .map-container {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 500px;
    }

    .map-grid {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(135deg, #ecfdf5 0%, #d1fae5 25%, #a7f3d0 50%, #6ee7b7 75%, #34d399 100%);
      background-size: 100% 100%;
      overflow: hidden;
    }

    .map-grid::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px),
        linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px);
      background-size: 40px 40px;
    }

    .map-grid::after {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 30% 20%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 60%, rgba(139, 92, 246, 0.1) 0%, transparent 40%),
        radial-gradient(ellipse at 20% 80%, rgba(245, 158, 11, 0.1) 0%, transparent 40%);
    }

    .map-marker {
      position: absolute;
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: translate(-50%, -100%) rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    .map-marker i {
      transform: rotate(45deg);
      color: white;
      font-size: 0.75rem;
    }

    .map-marker:hover {
      transform: translate(-50%, -100%) rotate(-45deg) scale(1.2);
      z-index: 20;
    }

    .map-marker.selected {
      transform: translate(-50%, -100%) rotate(-45deg) scale(1.3);
      z-index: 25;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }

    .marker-pulse {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 2px solid;
      opacity: 0;
      animation: pulse 2s infinite;
      transform: rotate(45deg);
    }

    @keyframes pulse {
      0% {
        transform: rotate(45deg) scale(1);
        opacity: 0.5;
      }
      100% {
        transform: rotate(45deg) scale(2);
        opacity: 0;
      }
    }

    .map-label {
      position: absolute;
      transform: translateX(-50%);
      font-size: 0.7rem;
      font-weight: 600;
      color: #1e293b;
      background: rgba(255,255,255,0.9);
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      white-space: nowrap;
      pointer-events: none;
      z-index: 5;
    }

    .compass {
      position: absolute;
      top: 1rem;
      right: 1rem;
      width: 48px;
      height: 48px;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 30;
    }

    .compass i {
      font-size: 1.5rem;
      color: #059669;
    }

    .compass-n {
      position: absolute;
      top: -4px;
      font-size: 0.625rem;
      font-weight: 700;
      color: #ef4444;
    }

    .scale-bar {
      position: absolute;
      bottom: 1rem;
      left: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255,255,255,0.9);
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      color: #64748b;
      z-index: 30;
    }

    .scale-line {
      width: 60px;
      height: 4px;
      background: #1e293b;
      border-radius: 2px;
    }

    .location-detail-panel {
      position: absolute;
      bottom: 1rem;
      right: 1rem;
      width: 280px;
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 40;
      overflow: hidden;
    }

    .detail-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-bottom: 1px solid #f1f5f9;
    }

    .detail-icon {
      width: 40px;
      height: 40px;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
    }

    .detail-title {
      flex: 1;
    }

    .detail-title h3 {
      margin: 0;
      font-size: 0.875rem;
      color: #1e293b;
    }

    .detail-title .terrain-type {
      font-size: 0.75rem;
      color: #64748b;
    }

    .close-btn {
      width: 28px;
      height: 28px;
      border: none;
      background: #f1f5f9;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
    }

    .close-btn:hover {
      background: #e2e8f0;
    }

    .detail-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      padding: 0.75rem;
    }

    .detail-stats .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.5rem;
      background: #f8fafc;
      border-radius: 0.5rem;
    }

    .detail-stats .stat i {
      color: #059669;
      margin-bottom: 0.25rem;
    }

    .detail-stats .stat span {
      font-weight: 600;
      color: #1e293b;
      font-size: 0.875rem;
    }

    .detail-stats .stat label {
      font-size: 0.625rem;
      color: #94a3b8;
      text-transform: uppercase;
    }

    .detail-coords {
      padding: 0.5rem 0.75rem;
      background: #f8fafc;
      font-size: 0.75rem;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .detail-coords i {
      color: #059669;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-y: auto;
    }

    .legend-card, .routes-card, .stats-card {
      background: white;
      border-radius: 0.75rem;
      padding: 1rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid #e2e8f0;
    }

    .legend-card h3, .routes-card h3, .stats-card h3 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .legend-card h3 i, .routes-card h3 i, .stats-card h3 i {
      color: #059669;
    }

    .legend-items {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.2s;
    }

    .legend-item:hover {
      background: #f8fafc;
    }

    .legend-item.active {
      background: #ecfdf5;
    }

    .legend-icon {
      width: 24px;
      height: 24px;
      border-radius: 0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 0.625rem;
    }

    .legend-name {
      flex: 1;
      font-size: 0.8rem;
      color: #475569;
    }

    .legend-count {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      background: #f1f5f9;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
    }

    .clear-filter-btn {
      width: 100%;
      margin-top: 0.75rem;
      padding: 0.5rem;
      border: 1px solid #e2e8f0;
      background: white;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
    }

    .clear-filter-btn:hover {
      background: #f8fafc;
    }

    .routes-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .route-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.5rem;
      background: #f8fafc;
      border-radius: 0.5rem;
    }

    .route-rank {
      width: 24px;
      height: 24px;
      background: #059669;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .route-info {
      flex: 1;
      min-width: 0;
    }

    .route-name {
      font-size: 0.8rem;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .route-meta {
      margin-top: 0.125rem;
    }

    .route-terrain {
      font-size: 0.7rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .route-stats {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.25rem;
      flex-wrap: wrap;
    }

    .route-stats span {
      font-size: 0.65rem;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 0.125rem;
    }

    .route-stats i {
      font-size: 0.6rem;
    }

    .route-visits {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }

    .visits-count {
      font-size: 1rem;
      font-weight: 700;
      color: #059669;
    }

    .visits-label {
      font-size: 0.6rem;
      color: #94a3b8;
    }

    .quick-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
    }

    .quick-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.5rem;
      background: #f8fafc;
      border-radius: 0.5rem;
    }

    .quick-stat .stat-value {
      font-size: 1rem;
      font-weight: 700;
      color: #1e293b;
    }

    .quick-stat .stat-label {
      font-size: 0.625rem;
      color: #94a3b8;
      text-align: center;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: #94a3b8;
    }

    .loading-state i {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    @media (max-width: 900px) {
      .locations-layout {
        grid-template-columns: 1fr;
      }

      .sidebar {
        flex-direction: row;
        flex-wrap: wrap;
      }

      .legend-card, .routes-card, .stats-card {
        flex: 1;
        min-width: 280px;
      }
    }
  `]
})
export class BikingLocationsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  locationStats: LocationStats | null = null;
  isLoading = true;
  selectedLocation: MapLocation | null = null;
  activeTerrain: string | null = null;

  // Map bounds based on sample data (NYC area approximation)
  private mapBounds = {
    minLat: 40.55,
    maxLat: 40.85,
    minLng: -74.20,
    maxLng: -73.85
  };

  constructor(
    private bikingService: BikingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    this.bikingService.locationStats$
      .pipe(takeUntil(this.destroy$))
      .subscribe(stats => {
        this.locationStats = stats;
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
    this.selectedLocation = null;
    this.activeTerrain = null;
    this.bikingService.refresh();
  }

  selectLocation(location: MapLocation): void {
    this.selectedLocation = this.selectedLocation?.id === location.id ? null : location;
  }

  filterByTerrain(terrain: string): void {
    this.activeTerrain = this.activeTerrain === terrain ? null : terrain;
  }

  clearFilter(): void {
    this.activeTerrain = null;
  }

  getTopLocations(): MapLocation[] {
    if (!this.locationStats) return [];
    return this.locationStats.mapLocations
      .filter(l => !this.activeTerrain || l.terrain === this.activeTerrain)
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, 5);
  }

  getMapX(loc: MapLocation): number {
    const range = this.mapBounds.maxLng - this.mapBounds.minLng;
    const normalized = (loc.longitude - this.mapBounds.minLng) / range;
    return 10 + normalized * 80; // Keep within 10-90% of container
  }

  getMapY(loc: MapLocation): number {
    const range = this.mapBounds.maxLat - this.mapBounds.minLat;
    const normalized = (this.mapBounds.maxLat - loc.latitude) / range; // Inverted because Y increases downward
    return 10 + normalized * 80; // Keep within 10-90% of container
  }

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

  getTerrainColor(terrain: string): string {
    const colors: Record<string, string> = {
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
    return colors[terrain] || '#6b7280';
  }

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

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Locations';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-map-location-dot';
  }
}
