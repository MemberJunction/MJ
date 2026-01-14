import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BikingInstrumentationService, MapLocation, LocationStats } from '../services/biking-instrumentation.service';
import {
  RouteRecommendationService,
  RouteSearchRequest,
  RouteSearchResult,
  RecommendedRoute,
  AttractionCategory,
  ATTRACTION_CATEGORIES
} from '../services/route-recommendation.service';

/**
 * Tree-shaking prevention function
 */
export function LoadBikingRouteRecommendationsResource() {
  // Force inclusion in production builds
}

/**
 * Route Recommendations Resource - AI-powered route discovery based on attraction preferences
 */
@RegisterClass(BaseResourceComponent, 'BikingRouteRecommendationsResource')
@Component({
  selector: 'mj-biking-route-recommendations-resource',
  template: `
    <div class="resource-container">
      <div class="recommendations-header">
        <h2><i class="fa-solid fa-wand-magic-sparkles"></i> AI Route Finder</h2>
        <p class="subtitle">Discover cycling routes with attractions that match your interests</p>
      </div>

      <div class="recommendations-layout">
        <!-- Search Panel -->
        <div class="search-panel">
          <div class="search-card">
            <h3><i class="fa-solid fa-sliders"></i> Search Preferences</h3>

            <!-- Location Selection -->
            <div class="form-group">
              <label><i class="fa-solid fa-location-dot"></i> Starting Location</label>
              <div class="location-selector">
                <select [(ngModel)]="selectedLocationId" (change)="onLocationChange()">
                  <option value="">Select a location...</option>
                  <option *ngFor="let loc of availableLocations" [value]="loc.id">
                    {{ loc.name }} ({{ loc.terrain }})
                  </option>
                </select>
              </div>
              <div class="selected-location-info" *ngIf="selectedLocation">
                <span class="terrain-badge" [style.background]="getTerrainColor(selectedLocation.terrain)">
                  <i [class]="'fa-solid ' + getTerrainIcon(selectedLocation.terrain)"></i>
                  {{ selectedLocation.terrain }}
                </span>
                <span class="coords">
                  {{ selectedLocation.latitude.toFixed(3) }}, {{ selectedLocation.longitude.toFixed(3) }}
                </span>
              </div>
            </div>

            <!-- Attraction Types -->
            <div class="form-group">
              <label><i class="fa-solid fa-heart"></i> What interests you?</label>
              <p class="help-text">Select the types of attractions you'd like to discover along your route</p>
              <div class="attraction-grid">
                <div class="attraction-option"
                     *ngFor="let category of attractionCategories"
                     [class.selected]="selectedAttractions.includes(category.id)"
                     (click)="toggleAttraction(category.id)">
                  <div class="attraction-icon">
                    <i [class]="'fa-solid ' + category.icon"></i>
                  </div>
                  <div class="attraction-info">
                    <span class="attraction-name">{{ category.name }}</span>
                    <span class="attraction-desc">{{ category.description }}</span>
                  </div>
                  <div class="check-indicator" *ngIf="selectedAttractions.includes(category.id)">
                    <i class="fa-solid fa-check"></i>
                  </div>
                </div>
              </div>
            </div>

            <!-- Custom Prompt -->
            <div class="form-group">
              <label><i class="fa-solid fa-message"></i> Additional Preferences (Optional)</label>
              <textarea
                [(ngModel)]="customPrompt"
                placeholder="e.g., 'I prefer less crowded routes' or 'Looking for family-friendly stops'"
                rows="3"
              ></textarea>
            </div>

            <!-- Max Distance -->
            <div class="form-group">
              <label><i class="fa-solid fa-road"></i> Maximum Distance</label>
              <div class="distance-slider">
                <input type="range" min="10" max="100" step="5" [(ngModel)]="maxDistanceKm">
                <span class="distance-value">{{ maxDistanceKm }} km</span>
              </div>
            </div>

            <!-- Search Button -->
            <button class="search-btn" (click)="searchRoutes()" [disabled]="isSearching">
              <ng-container *ngIf="!isSearching">
                <i class="fa-solid fa-magnifying-glass"></i> Find Routes with AI
              </ng-container>
              <ng-container *ngIf="isSearching">
                <i class="fa-solid fa-spinner fa-spin"></i> Searching...
              </ng-container>
            </button>
          </div>

          <!-- How it Works -->
          <div class="info-card">
            <h4><i class="fa-solid fa-circle-info"></i> How It Works</h4>
            <ol>
              <li>Select your starting location from your saved cycling spots</li>
              <li>Choose the types of attractions you want to discover</li>
              <li>Add any specific preferences or requirements</li>
              <li>Our AI searches the web to find the best routes matching your criteria</li>
            </ol>
            <p class="powered-by">
              <i class="fa-solid fa-robot"></i> Powered by Perplexity AI search
            </p>
          </div>
        </div>

        <!-- Results Panel -->
        <div class="results-panel">
          <!-- Initial State -->
          <div class="empty-state" *ngIf="!searchResult && !isSearching">
            <div class="empty-icon">
              <i class="fa-solid fa-route"></i>
            </div>
            <h3>Discover Your Perfect Route</h3>
            <p>Select your preferences and let AI find cycling routes with attractions that match your interests.</p>
          </div>

          <!-- Loading State -->
          <div class="loading-state" *ngIf="isSearching">
            <div class="loading-animation">
              <div class="pulse-ring"></div>
              <i class="fa-solid fa-robot"></i>
            </div>
            <h3>Searching the web...</h3>
            <p>Finding routes with {{ getSelectedAttractionNames() }}</p>
            <div class="search-query" *ngIf="lastSearchQuery">
              <i class="fa-solid fa-quote-left"></i>
              {{ lastSearchQuery }}
            </div>
          </div>

          <!-- Results -->
          <div class="results-content" *ngIf="searchResult && !isSearching">
            <!-- Summary -->
            <div class="results-summary">
              <div class="summary-icon">
                <i class="fa-solid fa-check-circle"></i>
              </div>
              <div class="summary-text">
                <h3>{{ searchResult.routes.length }} Routes Found</h3>
                <p>{{ searchResult.searchSummary }}</p>
              </div>
            </div>

            <!-- Route Cards -->
            <div class="route-cards">
              <div class="route-card" *ngFor="let route of searchResult.routes; let i = index"
                   [class.expanded]="expandedRouteId === route.id"
                   (click)="toggleRouteExpansion(route.id)">
                <!-- Route Header -->
                <div class="route-header">
                  <div class="route-rank">{{ i + 1 }}</div>
                  <div class="route-title">
                    <h4>{{ route.name }}</h4>
                    <div class="route-meta">
                      <span class="difficulty" [class]="route.difficulty">{{ route.difficulty }}</span>
                      <span class="terrain">{{ route.terrain }}</span>
                    </div>
                  </div>
                  <div class="route-quick-stats">
                    <div class="quick-stat">
                      <i class="fa-solid fa-road"></i>
                      <span>{{ route.estimatedDistanceKm }} km</span>
                    </div>
                    <div class="quick-stat">
                      <i class="fa-solid fa-clock"></i>
                      <span>{{ formatDuration(route.estimatedDurationMinutes) }}</span>
                    </div>
                  </div>
                  <div class="expand-icon">
                    <i [class]="'fa-solid ' + (expandedRouteId === route.id ? 'fa-chevron-up' : 'fa-chevron-down')"></i>
                  </div>
                </div>

                <!-- Expanded Content -->
                <div class="route-expanded" *ngIf="expandedRouteId === route.id">
                  <p class="route-description">{{ route.description }}</p>

                  <!-- Route Path -->
                  <div class="route-path">
                    <div class="path-point start">
                      <i class="fa-solid fa-play"></i>
                      <span>{{ route.startLocation }}</span>
                    </div>
                    <div class="path-line"></div>
                    <div class="path-point end">
                      <i class="fa-solid fa-flag-checkered"></i>
                      <span>{{ route.endLocation }}</span>
                    </div>
                  </div>

                  <!-- Attractions -->
                  <div class="attractions-section">
                    <h5><i class="fa-solid fa-star"></i> Attractions Along This Route</h5>
                    <div class="attraction-list">
                      <div class="attraction-item" *ngFor="let attraction of route.attractions">
                        <div class="attraction-icon-small">
                          <i [class]="'fa-solid ' + getAttractionIcon(attraction.type)"></i>
                        </div>
                        <div class="attraction-details">
                          <span class="name">{{ attraction.name }}</span>
                          <span class="type">{{ attraction.type }}</span>
                          <p class="desc">{{ attraction.description }}</p>
                        </div>
                        <div class="attraction-rating" *ngIf="attraction.rating">
                          <i class="fa-solid fa-star"></i>
                          {{ attraction.rating }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Highlights -->
                  <div class="highlights-section" *ngIf="route.highlights?.length">
                    <h5><i class="fa-solid fa-sparkles"></i> Highlights</h5>
                    <div class="highlight-tags">
                      <span class="highlight-tag" *ngFor="let highlight of route.highlights">
                        {{ highlight }}
                      </span>
                    </div>
                  </div>

                  <!-- Tips -->
                  <div class="tips-section" *ngIf="route.tips?.length">
                    <h5><i class="fa-solid fa-lightbulb"></i> Pro Tips</h5>
                    <ul class="tips-list">
                      <li *ngFor="let tip of route.tips">{{ tip }}</li>
                    </ul>
                  </div>

                  <!-- Best Time -->
                  <div class="best-time" *ngIf="route.bestTimeToVisit">
                    <i class="fa-solid fa-calendar"></i>
                    <span>Best time: {{ route.bestTimeToVisit }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Citations -->
            <div class="citations-section" *ngIf="searchResult.citations?.length">
              <h5><i class="fa-solid fa-link"></i> Sources</h5>
              <div class="citation-links">
                <a *ngFor="let url of searchResult.citations" [href]="url" target="_blank" rel="noopener">
                  {{ getDomainFromUrl(url) }}
                  <i class="fa-solid fa-external-link-alt"></i>
                </a>
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
      overflow: hidden;
      box-sizing: border-box;
      padding: 1.5rem;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
    }

    .recommendations-header {
      margin-bottom: 1rem;
      flex-shrink: 0;
    }

    .recommendations-header h2 {
      margin: 0;
      color: #1e293b;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .recommendations-header h2 i {
      color: #8b5cf6;
    }

    .recommendations-header .subtitle {
      margin: 0.25rem 0 0 0;
      color: #64748b;
      font-size: 0.875rem;
    }

    .recommendations-layout {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 1.5rem;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    /* Search Panel */
    .search-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-y: auto;
    }

    .search-card, .info-card {
      background: white;
      border-radius: 0.75rem;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid #e2e8f0;
    }

    .search-card h3, .info-card h4 {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .search-card h3 i {
      color: #8b5cf6;
    }

    .info-card h4 i {
      color: #059669;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-group label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.5rem;
    }

    .form-group label i {
      color: #6b7280;
    }

    .help-text {
      font-size: 0.75rem;
      color: #6b7280;
      margin: 0 0 0.5rem 0;
    }

    .location-selector select {
      width: 100%;
      padding: 0.625rem;
      border: 1px solid #d1d5db;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      background: white;
      color: #1e293b;
    }

    .selected-location-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
      font-size: 0.75rem;
    }

    .terrain-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      color: white;
      font-size: 0.7rem;
      text-transform: capitalize;
    }

    .coords {
      color: #6b7280;
    }

    /* Attraction Grid */
    .attraction-grid {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .attraction-option {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .attraction-option:hover {
      border-color: #c4b5fd;
      background: #f5f3ff;
    }

    .attraction-option.selected {
      border-color: #8b5cf6;
      background: #f5f3ff;
    }

    .attraction-icon {
      width: 36px;
      height: 36px;
      border-radius: 0.5rem;
      background: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #8b5cf6;
      font-size: 1rem;
      flex-shrink: 0;
    }

    .attraction-option.selected .attraction-icon {
      background: #8b5cf6;
      color: white;
    }

    .attraction-info {
      flex: 1;
      min-width: 0;
    }

    .attraction-name {
      display: block;
      font-size: 0.875rem;
      font-weight: 600;
      color: #1e293b;
    }

    .attraction-desc {
      display: block;
      font-size: 0.7rem;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .check-indicator {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #8b5cf6;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      flex-shrink: 0;
    }

    /* Custom Prompt */
    textarea {
      width: 100%;
      padding: 0.625rem;
      border: 1px solid #d1d5db;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      resize: none;
      font-family: inherit;
    }

    textarea:focus {
      outline: none;
      border-color: #8b5cf6;
      box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
    }

    /* Distance Slider */
    .distance-slider {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .distance-slider input[type="range"] {
      flex: 1;
      accent-color: #8b5cf6;
    }

    .distance-value {
      font-size: 0.875rem;
      font-weight: 600;
      color: #8b5cf6;
      min-width: 50px;
    }

    /* Search Button */
    .search-btn {
      width: 100%;
      padding: 0.875rem;
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: all 0.2s;
    }

    .search-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }

    .search-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    /* Info Card */
    .info-card ol {
      margin: 0;
      padding-left: 1.25rem;
      font-size: 0.8rem;
      color: #4b5563;
    }

    .info-card li {
      margin-bottom: 0.375rem;
    }

    .powered-by {
      margin: 0.75rem 0 0 0;
      padding-top: 0.75rem;
      border-top: 1px solid #e5e7eb;
      font-size: 0.75rem;
      color: #6b7280;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    /* Results Panel */
    .results-panel {
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid #e2e8f0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    /* Empty State */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      text-align: center;
      color: #64748b;
    }

    .empty-icon {
      width: 80px;
      height: 80px;
      background: #f1f5f9;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5rem;
    }

    .empty-icon i {
      font-size: 2rem;
      color: #94a3b8;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem 0;
      color: #1e293b;
      font-size: 1.25rem;
    }

    .empty-state p {
      margin: 0;
      max-width: 300px;
    }

    /* Loading State */
    .loading-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      text-align: center;
    }

    .loading-animation {
      position: relative;
      width: 80px;
      height: 80px;
      margin-bottom: 1.5rem;
    }

    .loading-animation i {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 2rem;
      color: #8b5cf6;
    }

    .pulse-ring {
      position: absolute;
      inset: 0;
      border: 3px solid #8b5cf6;
      border-radius: 50%;
      animation: pulse-ring 1.5s ease-out infinite;
    }

    @keyframes pulse-ring {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    .loading-state h3 {
      margin: 0 0 0.5rem 0;
      color: #1e293b;
    }

    .loading-state p {
      margin: 0;
      color: #64748b;
    }

    .search-query {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #f5f3ff;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: #7c3aed;
      max-width: 400px;
    }

    .search-query i {
      margin-right: 0.5rem;
      opacity: 0.5;
    }

    /* Results Content */
    .results-content {
      padding: 1.25rem;
    }

    .results-summary {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1rem;
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 0.75rem;
      margin-bottom: 1.25rem;
    }

    .summary-icon {
      width: 40px;
      height: 40px;
      background: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      flex-shrink: 0;
    }

    .summary-text h3 {
      margin: 0 0 0.25rem 0;
      color: #166534;
      font-size: 1.1rem;
    }

    .summary-text p {
      margin: 0;
      font-size: 0.875rem;
      color: #15803d;
    }

    /* Route Cards */
    .route-cards {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .route-card {
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.2s;
    }

    .route-card:hover {
      border-color: #c4b5fd;
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1);
    }

    .route-card.expanded {
      border-color: #8b5cf6;
    }

    .route-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #fafafa;
    }

    .route-rank {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.875rem;
      flex-shrink: 0;
    }

    .route-title {
      flex: 1;
      min-width: 0;
    }

    .route-title h4 {
      margin: 0;
      font-size: 1rem;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .route-meta {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.25rem;
    }

    .difficulty, .terrain {
      font-size: 0.7rem;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      text-transform: capitalize;
    }

    .difficulty {
      background: #fef3c7;
      color: #92400e;
    }

    .difficulty.easy { background: #d1fae5; color: #065f46; }
    .difficulty.moderate { background: #fef3c7; color: #92400e; }
    .difficulty.challenging { background: #fee2e2; color: #991b1b; }
    .difficulty.expert { background: #f3e8ff; color: #6b21a8; }

    .terrain {
      background: #f1f5f9;
      color: #475569;
    }

    .route-quick-stats {
      display: flex;
      gap: 1rem;
    }

    .quick-stat {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.8rem;
      color: #64748b;
    }

    .quick-stat i {
      color: #8b5cf6;
    }

    .expand-icon {
      color: #94a3b8;
      transition: color 0.2s;
    }

    .route-card:hover .expand-icon {
      color: #8b5cf6;
    }

    /* Expanded Content */
    .route-expanded {
      padding: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .route-description {
      margin: 0 0 1rem 0;
      font-size: 0.875rem;
      color: #4b5563;
      line-height: 1.5;
    }

    .route-path {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
    }

    .path-point {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: #1e293b;
    }

    .path-point.start i { color: #10b981; }
    .path-point.end i { color: #ef4444; }

    .path-line {
      flex: 1;
      height: 2px;
      background: linear-gradient(90deg, #10b981 0%, #ef4444 100%);
      border-radius: 1px;
    }

    /* Attractions Section */
    .attractions-section, .highlights-section, .tips-section {
      margin-bottom: 1rem;
    }

    .attractions-section h5, .highlights-section h5, .tips-section h5 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .attractions-section h5 i { color: #f59e0b; }
    .highlights-section h5 i { color: #8b5cf6; }
    .tips-section h5 i { color: #10b981; }

    .attraction-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .attraction-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem;
      background: #fefce8;
      border-radius: 0.5rem;
    }

    .attraction-icon-small {
      width: 32px;
      height: 32px;
      background: #fef3c7;
      border-radius: 0.375rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #d97706;
      flex-shrink: 0;
    }

    .attraction-details {
      flex: 1;
      min-width: 0;
    }

    .attraction-details .name {
      display: block;
      font-weight: 600;
      font-size: 0.875rem;
      color: #1e293b;
    }

    .attraction-details .type {
      display: block;
      font-size: 0.7rem;
      color: #92400e;
      margin-bottom: 0.25rem;
    }

    .attraction-details .desc {
      margin: 0;
      font-size: 0.8rem;
      color: #4b5563;
    }

    .attraction-rating {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #f59e0b;
      flex-shrink: 0;
    }

    /* Highlights */
    .highlight-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .highlight-tag {
      padding: 0.375rem 0.75rem;
      background: #f5f3ff;
      color: #7c3aed;
      border-radius: 1rem;
      font-size: 0.8rem;
    }

    /* Tips */
    .tips-list {
      margin: 0;
      padding-left: 1.25rem;
      font-size: 0.8rem;
      color: #4b5563;
    }

    .tips-list li {
      margin-bottom: 0.25rem;
    }

    /* Best Time */
    .best-time {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #eff6ff;
      border-radius: 0.375rem;
      font-size: 0.8rem;
      color: #1e40af;
    }

    .best-time i {
      color: #3b82f6;
    }

    /* Citations */
    .citations-section {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .citations-section h5 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .citation-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .citation-links a {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.375rem 0.625rem;
      background: #f1f5f9;
      color: #3b82f6;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      text-decoration: none;
      transition: background 0.2s;
    }

    .citation-links a:hover {
      background: #e0f2fe;
    }

    .citation-links a i {
      font-size: 0.625rem;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .recommendations-layout {
        grid-template-columns: 1fr;
      }

      .search-panel {
        flex-direction: row;
        flex-wrap: wrap;
      }

      .search-card {
        flex: 2;
        min-width: 300px;
      }

      .info-card {
        flex: 1;
        min-width: 280px;
      }

      .attraction-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class BikingRouteRecommendationsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Data from services
  locationStats: LocationStats | null = null;
  availableLocations: MapLocation[] = [];
  attractionCategories = ATTRACTION_CATEGORIES;

  // Form state
  selectedLocationId = '';
  selectedLocation: MapLocation | null = null;
  selectedAttractions: string[] = [];
  customPrompt = '';
  maxDistanceKm = 30;

  // Search state
  isSearching = false;
  searchResult: RouteSearchResult | null = null;
  lastSearchQuery = '';
  expandedRouteId: string | null = null;

  constructor(
    private bikingService: BikingInstrumentationService,
    private routeService: RouteRecommendationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    // Load location data
    this.bikingService.locationStats$
      .pipe(takeUntil(this.destroy$))
      .subscribe(stats => {
        this.locationStats = stats;
        this.availableLocations = stats.mapLocations;
        this.cdr.detectChanges();
        this.NotifyLoadComplete();
      });

    // Subscribe to search state
    this.routeService.isSearching$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isSearching => {
        this.isSearching = isSearching;
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onLocationChange(): void {
    this.selectedLocation = this.availableLocations.find(l => l.id === this.selectedLocationId) || null;
  }

  toggleAttraction(categoryId: string): void {
    const index = this.selectedAttractions.indexOf(categoryId);
    if (index >= 0) {
      this.selectedAttractions.splice(index, 1);
    } else {
      this.selectedAttractions.push(categoryId);
    }
  }

  searchRoutes(): void {
    const request: RouteSearchRequest = {
      location: this.selectedLocation,
      attractionTypes: this.selectedAttractions,
      customPrompt: this.customPrompt || undefined,
      maxDistanceKm: this.maxDistanceKm
    };

    this.lastSearchQuery = this.buildSearchQueryPreview(request);
    this.expandedRouteId = null;

    this.routeService.searchRoutes(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.searchResult = result;
        // Auto-expand first route
        if (result.routes.length > 0) {
          this.expandedRouteId = result.routes[0].id;
        }
        this.cdr.detectChanges();
      });
  }

  toggleRouteExpansion(routeId: string): void {
    this.expandedRouteId = this.expandedRouteId === routeId ? null : routeId;
  }

  getSelectedAttractionNames(): string {
    if (this.selectedAttractions.length === 0) {
      return 'interesting attractions';
    }
    return this.selectedAttractions
      .map(id => this.attractionCategories.find(c => c.id === id)?.name || id)
      .join(', ');
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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
      mixed: 'fa-shuffle'
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
      mixed: '#6366f1'
    };
    return colors[terrain] || '#6b7280';
  }

  getAttractionIcon(type: string): string {
    const typeLower = type.toLowerCase();
    if (typeLower.includes('scenic') || typeLower.includes('view')) return 'fa-mountain-sun';
    if (typeLower.includes('nature') || typeLower.includes('wildlife')) return 'fa-leaf';
    if (typeLower.includes('historic')) return 'fa-landmark';
    if (typeLower.includes('water') || typeLower.includes('beach')) return 'fa-water';
    if (typeLower.includes('food') || typeLower.includes('drink')) return 'fa-utensils';
    if (typeLower.includes('art') || typeLower.includes('culture')) return 'fa-palette';
    if (typeLower.includes('adventure')) return 'fa-person-hiking';
    return 'fa-star';
  }

  getDomainFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  private buildSearchQueryPreview(request: RouteSearchRequest): string {
    const locationName = request.location?.name || 'San Francisco Bay Area';
    const attractionTypes = request.attractionTypes.length > 0
      ? request.attractionTypes.map(id => {
          const category = ATTRACTION_CATEGORIES.find(c => c.id === id);
          return category?.name || id;
        }).join(', ')
      : 'scenic and interesting';

    return `Best cycling routes near ${locationName} with ${attractionTypes} attractions within ${request.maxDistanceKm}km`;
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Route Finder';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-wand-magic-sparkles';
  }
}
