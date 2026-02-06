import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ElementRef, ViewChild, AfterViewInit, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { CompositeKey, TelemetryManager, TelemetryEvent, TelemetryPattern, TelemetryInsight, TelemetryCategory, TelemetryParamsUnion, isSingleRunViewParams, isSingleRunQueryParams, isBatchRunViewParams } from '@memberjunction/core';
import { ResourceData, UserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseEngineRegistry, EngineMemoryStats, LocalCacheManager, CacheEntryInfo, CacheStats, CacheEntryType, Metadata } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import * as d3 from 'd3';

/**
 * Interface representing a single engine's diagnostic info for display
 */
export interface EngineDiagnosticInfo {
    className: string;
    isLoaded: boolean;
    registeredAt: Date;
    lastLoadedAt: Date | null;
    estimatedMemoryBytes: number;
    itemCount: number;
    memoryDisplay: string;
}

/**
 * Interface for engine config items for drill-down detail
 */
export interface EngineConfigItemDisplay {
    propertyName: string;
    type: 'entity' | 'dataset';
    entityName?: string;
    datasetName?: string;
    filter?: string;
    orderBy?: string;
    itemCount: number;
    estimatedMemoryBytes: number;
    memoryDisplay: string;
    sampleData: unknown[];
    expanded: boolean;
    // Paging support
    displayedData: unknown[];
    allDataLoaded: boolean;
    isLoadingMore: boolean;
    currentPage: number;
    pageSize: number;
}

/**
 * Engine detail panel state
 */
export interface EngineDetailPanelState {
    isOpen: boolean;
    engine: EngineDiagnosticInfo | null;
    configItems: EngineConfigItemDisplay[];
    isRefreshing: boolean;
}

/**
 * Interface for redundant entity loading info
 */
export interface RedundantLoadInfo {
    entityName: string;
    engines: string[];
}

/**
 * Display-friendly telemetry pattern info
 */
export interface TelemetryPatternDisplay {
    fingerprint: string;
    category: TelemetryCategory;
    operation: string;
    entityName: string | null;
    filter: string | null;
    orderBy: string | null;
    count: number;
    avgElapsedMs: number;
    totalElapsedMs: number;
    minElapsedMs: number;
    maxElapsedMs: number;
    lastSeen: Date;
    sampleParams: TelemetryParamsUnion;
}

/**
 * Display-friendly telemetry event for timeline
 */
export interface TelemetryEventDisplay {
    id: string;
    category: TelemetryCategory;
    operation: string;
    entityName: string | null;
    filter: string | null;
    startTime: number;
    endTime: number | undefined;
    elapsedMs: number | undefined;
    timestamp: Date;
    params: TelemetryParamsUnion;
}

/**
 * Extended insight with expansion state
 */
export interface TelemetryInsightDisplay extends TelemetryInsight {
    expanded: boolean;
    relatedEvents: TelemetryEventDisplay[];
}

/**
 * Sort configuration for patterns table
 */
export interface PatternSortConfig {
    column: 'category' | 'operation' | 'entity' | 'count' | 'avgMs' | 'totalMs';
    direction: 'asc' | 'desc';
}

/**
 * Event detail panel state
 */
export interface EventDetailPanelState {
    isOpen: boolean;
    event: TelemetryEventDisplay | null;
    relatedPattern: TelemetryPatternDisplay | null;
}

/**
 * Summary stats for telemetry
 */
export interface TelemetrySummary {
    totalEvents: number;
    totalPatterns: number;
    totalInsights: number;
    activeEvents: number;
    byCategory: Record<TelemetryCategory, { events: number; avgMs: number }>;
}

/**
 * Settings key for persisting user preferences
 */
const SYSTEM_DIAGNOSTICS_SETTINGS_KEY = 'SystemDiagnostics.UserPreferences';

/**
 * Interface for persisted user preferences
 */
export interface SystemDiagnosticsUserPreferences {
    kpiCardsCollapsed: boolean;
    activeSection: 'engines' | 'redundant' | 'performance' | 'cache';
    perfTab: 'monitor' | 'overview' | 'events' | 'patterns' | 'insights';
    telemetrySource: 'client' | 'server';
    categoryFilter: 'all' | TelemetryCategory;
    chartZoomLevel: number;
    chartGapCompression: boolean;
    autoRefresh: boolean;
}

/**
 * Tree-shaking prevention function - ensures component is included in builds
 */
export function LoadSystemDiagnosticsResource() {
    // Force inclusion in production builds
}

/**
 * System Diagnostics Resource Component
 *
 * Provides a comprehensive view of:
 * - All registered BaseEngine instances and their memory usage
 * - Entity load tracking across engines (identifies redundant loading)
 *
 * This is a client-side only dashboard - all data comes from in-memory registries.
 */
@RegisterClass(BaseResourceComponent, 'SystemDiagnosticsResource')
@Component({
  standalone: false,
    selector: 'app-system-diagnostics',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="system-diagnostics">
          <!-- Header -->
          <div class="diagnostics-header">
            <div class="header-title">
              <i class="fa-solid fa-stethoscope"></i>
              <h2>System Diagnostics</h2>
            </div>
            <div class="header-controls">
              <div class="auto-refresh-control">
                <label>
                  <input type="checkbox" [(ngModel)]="autoRefresh" (change)="toggleAutoRefresh()">
                  Auto-refresh
                </label>
                @if (autoRefresh) {
                  <span class="refresh-indicator">
                    <i class="fa-solid fa-sync-alt spinning"></i>
                    Every 5s
                  </span>
                }
              </div>
              <button class="refresh-btn" (click)="refreshData()" [disabled]="isLoading">
                <i class="fa-solid fa-refresh" [class.spinning]="isLoading"></i>
                Refresh Now
              </button>
            </div>
          </div>
        
          <!-- Overview Cards (Collapsible) -->
          <div class="overview-cards-container" [class.collapsed]="kpiCardsCollapsed">
            <button class="kpi-toggle-btn" (click)="toggleKpiCards()" [title]="kpiCardsCollapsed ? 'Expand KPI cards' : 'Collapse KPI cards'">
              <i class="fa-solid" [class.fa-chevron-up]="!kpiCardsCollapsed" [class.fa-chevron-down]="kpiCardsCollapsed"></i>
            </button>
        
            @if (!kpiCardsCollapsed) {
              <!-- Expanded View -->
              <div class="overview-cards">
                <div class="overview-card">
                  <div class="card-icon card-icon--engines">
                    <i class="fa-solid fa-cogs"></i>
                  </div>
                  <div class="card-content">
                    <div class="card-value">{{ engineStats?.totalEngines || 0 }}</div>
                    <div class="card-label">Registered Engines</div>
                    <div class="card-subtitle">{{ engineStats?.loadedEngines || 0 }} loaded</div>
                  </div>
                </div>
        
                <div class="overview-card">
                  <div class="card-icon card-icon--memory">
                    <i class="fa-solid fa-microchip"></i>
                  </div>
                  <div class="card-content">
                    <div class="card-value">{{ formatBytes(engineStats?.totalEstimatedMemoryBytes || 0) }}</div>
                    <div class="card-label">Engine Memory</div>
                    <div class="card-subtitle">Estimated total</div>
                  </div>
                </div>
        
                <div class="overview-card">
                  <div class="card-icon" [class.card-icon--warning]="redundantLoads.length > 0" [class.card-icon--success]="redundantLoads.length === 0">
                    <i class="fa-solid fa-copy"></i>
                  </div>
                  <div class="card-content">
                    <div class="card-value">{{ redundantLoads.length }}</div>
                    <div class="card-label">Redundant Loads</div>
                    <div class="card-subtitle">
                      @if (redundantLoads.length === 0) {
                        No redundant loading detected
                      } @else {
                        {{ redundantLoads.length }} entities loaded by multiple engines
                      }
                    </div>
                  </div>
                </div>
              </div>
            } @else {
              <!-- Collapsed View - Mini KPI bar -->
              <div class="overview-cards-mini">
                <div class="mini-kpi" title="Registered Engines">
                  <i class="fa-solid fa-cogs"></i>
                  <span class="mini-value">{{ engineStats?.totalEngines || 0 }}</span>
                  <span class="mini-label">Engines</span>
                </div>
                <div class="mini-divider"></div>
                <div class="mini-kpi" title="Engine Memory">
                  <i class="fa-solid fa-microchip"></i>
                  <span class="mini-value">{{ formatBytes(engineStats?.totalEstimatedMemoryBytes || 0) }}</span>
                  <span class="mini-label">Memory</span>
                </div>
                <div class="mini-divider"></div>
                <div class="mini-kpi" [class.warning]="redundantLoads.length > 0" title="Redundant Loads">
                  <i class="fa-solid fa-copy"></i>
                  <span class="mini-value">{{ redundantLoads.length }}</span>
                  <span class="mini-label">Redundant</span>
                </div>
              </div>
            }
          </div>
        
          <!-- Main Content with Left Nav -->
          <div class="main-content">
            <!-- Left Navigation -->
            <div class="left-nav">
              <div class="nav-section">
                <div class="nav-section-title">Diagnostics</div>
                <div
                  class="nav-item"
                  [class.active]="activeSection === 'engines'"
                  (click)="setActiveSection('engines')"
                  >
                  <i class="fa-solid fa-cogs"></i>
                  <span>Engine Registry</span>
                  <span class="nav-badge">{{ engineStats?.totalEngines || 0 }}</span>
                </div>
                <div
                  class="nav-item"
                  [class.active]="activeSection === 'redundant'"
                  (click)="setActiveSection('redundant')"
                  >
                  <i class="fa-solid fa-copy"></i>
                  <span>Redundant Loading</span>
                  @if (redundantLoads.length > 0) {
                    <span class="nav-badge nav-badge--warning">{{ redundantLoads.length }}</span>
                  } @else {
                    <span class="nav-badge nav-badge--success">0</span>
                  }
                </div>
                <div
                  class="nav-item"
                  [class.active]="activeSection === 'performance'"
                  (click)="setActiveSection('performance')"
                  >
                  <i class="fa-solid fa-chart-line"></i>
                  <span>Performance</span>
                  <span class="nav-badge">{{ telemetrySummary?.totalEvents || 0 }}</span>
                </div>
                <div
                  class="nav-item"
                  [class.active]="activeSection === 'cache'"
                  (click)="setActiveSection('cache')"
                  >
                  <i class="fa-solid fa-database"></i>
                  <span>Local Cache</span>
                  <span class="nav-badge">{{ cacheStats?.totalEntries || 0 }}</span>
                </div>
              </div>
            </div>
        
            <!-- Content Area -->
            <div class="content-area">
              <!-- Engine Registry Section -->
              @if (activeSection === 'engines') {
                <div class="section-panel">
                  <div class="panel-header">
                    <h3>
                      <i class="fa-solid fa-cogs"></i>
                      Registered Engines
                    </h3>
                    <div class="panel-actions">
                      <button class="action-btn" (click)="refreshAllEngines()" [disabled]="isRefreshingEngines">
                        <i class="fa-solid fa-sync" [class.spinning]="isRefreshingEngines"></i>
                        Refresh All Engines
                      </button>
                    </div>
                  </div>
        
                  <div class="section-panel-content">
                    @if (engines.length === 0) {
                      <div class="empty-state">
                        <i class="fa-solid fa-inbox"></i>
                        <p>No engines registered yet</p>
                        <span class="empty-hint">Engines register themselves when they are first configured</span>
                      </div>
                    } @else {
                      <div class="engine-grid">
                        @for (engine of engines; track engine.className) {
                          <div class="engine-card" [class.loaded]="engine.isLoaded">
                            <div class="engine-header">
                              <div class="engine-name" [title]="engine.className">{{ engine.className }}</div>
                              <div class="engine-status" [class.status-loaded]="engine.isLoaded" [class.status-pending]="!engine.isLoaded">
                                {{ engine.isLoaded ? 'Loaded' : 'Not Loaded' }}
                              </div>
                            </div>
                            <div class="engine-stats">
                              <div class="stat-item">
                                <i class="fa-solid fa-microchip"></i>
                                <span class="stat-label">Memory:</span>
                                <span class="stat-value">{{ engine.memoryDisplay }}</span>
                              </div>
                              <div class="stat-item">
                                <i class="fa-solid fa-layer-group"></i>
                                <span class="stat-label">Items:</span>
                                <span class="stat-value">{{ engine.itemCount.toLocaleString() }}</span>
                              </div>
                              @if (engine.lastLoadedAt) {
                                <div class="stat-item">
                                  <i class="fa-solid fa-clock"></i>
                                  <span class="stat-label">Loaded:</span>
                                  <span class="stat-value">{{ formatTime(engine.lastLoadedAt) }}</span>
                                </div>
                              }
                            </div>
                            <div class="engine-actions">
                              <button class="engine-action-btn" (click)="refreshSingleEngine(engine, $event)" [disabled]="!engine.isLoaded || isRefreshingSingleEngine === engine.className" title="Refresh this engine">
                                <i class="fa-solid fa-sync" [class.spinning]="isRefreshingSingleEngine === engine.className"></i>
                              </button>
                              <button class="engine-action-btn" (click)="openEngineDetailPanel(engine)" [disabled]="!engine.isLoaded" title="View engine details">
                                <i class="fa-solid fa-arrow-right"></i>
                              </button>
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
        
              <!-- Redundant Loading Section -->
              @if (activeSection === 'redundant') {
                <div class="section-panel">
                  <div class="panel-header">
                    <h3>
                      <i class="fa-solid fa-copy"></i>
                      Redundant Entity Loading
                    </h3>
                  </div>
        
                  <div class="section-panel-content">
                    <div class="info-banner">
                      <i class="fa-solid fa-info-circle"></i>
                      <div>
                        <strong>What is this?</strong>
                        This section shows entities that are loaded by multiple engines.
                        Redundant loading indicates potential optimization opportunities where engines
                        could share data or consolidate their loading logic.
                      </div>
                    </div>
        
                    @if (redundantLoads.length === 0) {
                      <div class="empty-state success-state">
                        <i class="fa-solid fa-check-circle"></i>
                        <p>No redundant entity loading detected</p>
                        <span class="empty-hint">Each entity is being loaded by only one engine</span>
                      </div>
                    } @else {
                      <div class="redundant-loads-table-wrapper">
                        <table class="redundant-loads-table">
                          <thead>
                            <tr>
                              <th>Entity Name</th>
                              <th>Loaded By Engines</th>
                              <th class="text-right">Engine Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (load of redundantLoads; track load.entityName) {
                              <tr>
                                <td class="entity-name">{{ load.entityName }}</td>
                                <td class="engines-cell">
                                  <div class="engine-chips">
                                    @for (engine of load.engines; track engine) {
                                      <span class="engine-chip">{{ engine }}</span>
                                    }
                                  </div>
                                </td>
                                <td class="text-right count-cell">
                                  <span class="count-badge">{{ load.engines.length }}</span>
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
        
                      <div class="recommendation-banner">
                        <i class="fa-solid fa-lightbulb"></i>
                        <div>
                          <strong>Recommendation:</strong>
                          Consider consolidating data loading by having dependent engines
                          access data from a parent engine, or restructuring the engine
                          hierarchy to avoid duplicate data fetches.
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
        
              <!-- Performance Section -->
              @if (activeSection === 'performance') {
                <div class="section-panel perf-panel">
                  <div class="panel-header">
                    <h3>
                      <i class="fa-solid fa-chart-line"></i>
                      Performance Telemetry
                    </h3>
                    <div class="panel-actions">
                      <!-- Source toggle -->
                      <div class="source-toggle">
                        <button class="source-btn" [class.active]="telemetrySource === 'client'" (click)="setTelemetrySource('client')">
                          <i class="fa-solid fa-browser"></i>
                          Client
                        </button>
                        <button class="source-btn" [class.active]="telemetrySource === 'server'" (click)="setTelemetrySource('server')">
                          <i class="fa-solid fa-server"></i>
                          Server
                        </button>
                      </div>
                      <span class="action-divider"></span>
                      @if (telemetrySource === 'client') {
                        <button class="action-btn" [class.active]="telemetryEnabled" (click)="toggleTelemetry()">
                          <i class="fa-solid" [class.fa-toggle-on]="telemetryEnabled" [class.fa-toggle-off]="!telemetryEnabled"></i>
                          {{ telemetryEnabled ? 'Enabled' : 'Disabled' }}
                        </button>
                        <button class="action-btn" (click)="clearTelemetry()" [disabled]="!telemetryEnabled">
                          <i class="fa-solid fa-trash"></i>
                          Clear
                        </button>
                      } @else {
                        <span class="status-indicator" [class.enabled]="serverTelemetryEnabled" [class.disabled]="!serverTelemetryEnabled">
                          <i class="fa-solid" [class.fa-circle-check]="serverTelemetryEnabled" [class.fa-circle-xmark]="!serverTelemetryEnabled"></i>
                          {{ serverTelemetryEnabled ? 'Enabled' : 'Disabled' }}
                          <span class="config-note" title="Configure via mj.config.cjs telemetry section">(config)</span>
                        </span>
                      }
                      @if (serverTelemetryLoading) {
                        <span class="loading-indicator">
                          <i class="fa-solid fa-spinner fa-spin"></i>
                        </span>
                      }
                    </div>
                  </div>
                  @if (serverTelemetryError) {
                    <div class="error-banner">
                      <i class="fa-solid fa-exclamation-triangle"></i>
                      {{ serverTelemetryError }}
                      <button class="dismiss-btn" (click)="serverTelemetryError = null">
                        <i class="fa-solid fa-times"></i>
                      </button>
                    </div>
                  }
        
                  <!-- Performance Sub-Navigation Tabs -->
                  <div class="perf-tabs">
                    <button class="perf-tab" [class.active]="perfTab === 'monitor'" (click)="setPerfTab('monitor')">
                      <i class="fa-solid fa-chart-area"></i>
                      <span>Monitor</span>
                    </button>
                    <button class="perf-tab" [class.active]="perfTab === 'overview'" (click)="setPerfTab('overview')">
                      <i class="fa-solid fa-gauge"></i>
                      <span>Overview</span>
                      @if (slowQueries.length > 0) {
                        <span class="tab-badge warning">{{ slowQueries.length }}</span>
                      }
                    </button>
                    <button class="perf-tab" [class.active]="perfTab === 'events'" (click)="setPerfTab('events')">
                      <i class="fa-solid fa-timeline"></i>
                      <span>Events</span>
                      <span class="tab-badge">{{ telemetrySummary?.totalEvents || 0 }}</span>
                    </button>
                    <button class="perf-tab" [class.active]="perfTab === 'patterns'" (click)="setPerfTab('patterns')">
                      <i class="fa-solid fa-fingerprint"></i>
                      <span>Patterns</span>
                      <span class="tab-badge">{{ telemetrySummary?.totalPatterns || 0 }}</span>
                    </button>
                    <button class="perf-tab" [class.active]="perfTab === 'insights'" (click)="setPerfTab('insights')">
                      <i class="fa-solid fa-lightbulb"></i>
                      <span>Insights</span>
                      @if (telemetryInsights.length > 0) {
                        <span class="tab-badge insight">{{ telemetryInsights.length }}</span>
                      }
                    </button>
                  </div>
        
                  <div class="section-panel-content">
                    @if (!telemetryEnabled) {
                      <div class="info-banner warning-banner">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <div>
                          <strong>Telemetry is disabled.</strong>
                          Enable telemetry to track RunView, RunQuery, and Engine loading performance.
                        </div>
                      </div>
                    }
        
                    <!-- Monitor Tab (PerfMon Chart) -->
                    @if (perfTab === 'monitor') {
                      <div class="perfmon-section">
                        <div class="perfmon-header">
                          <div class="perfmon-legend">
                            <span class="legend-item runview"><span class="legend-dot"></span> RunView</span>
                            <span class="legend-item runquery"><span class="legend-dot"></span> RunQuery</span>
                            <span class="legend-item engine"><span class="legend-dot"></span> Engine</span>
                            <span class="legend-item ai"><span class="legend-dot"></span> AI</span>
                          </div>
                          <div class="perfmon-controls">
                            <!-- Interaction Mode Toggle -->
                            <div class="mode-toggle" title="Chart Interaction Mode">
                              <button
                                class="mode-btn"
                                [class.active]="chartInteractionMode === 'pointer'"
                                (click)="setChartInteractionMode('pointer')"
                                title="Pointer mode - click events to view details">
                                <i class="fa-solid fa-arrow-pointer"></i>
                              </button>
                              <button
                                class="mode-btn"
                                [class.active]="chartInteractionMode === 'select'"
                                (click)="setChartInteractionMode('select')"
                                title="Select mode - drag to zoom into a time range">
                                <i class="fa-solid fa-vector-square"></i>
                              </button>
                              <button
                                class="mode-btn"
                                [class.active]="chartInteractionMode === 'pan'"
                                (click)="setChartInteractionMode('pan')"
                                title="Pan mode - drag to pan the chart">
                                <i class="fa-solid fa-hand"></i>
                              </button>
                            </div>
                            <span class="control-divider"></span>
                            <button class="chart-control-btn" (click)="zoomPerfChart('in')" title="Zoom In">
                              <i class="fa-solid fa-search-plus"></i>
                            </button>
                            <button class="chart-control-btn" (click)="zoomPerfChart('out')" title="Zoom Out">
                              <i class="fa-solid fa-search-minus"></i>
                            </button>
                            <button class="chart-control-btn" (click)="resetPerfChartZoom()" title="Reset Zoom">
                              <i class="fa-solid fa-expand"></i>
                            </button>
                            <span class="control-divider"></span>
                            <label class="compress-toggle" title="Automatically compress gaps with no activity">
                              <input type="checkbox" [(ngModel)]="chartGapCompression" (change)="onGapCompressionChange()">
                              <span>Compress Gaps</span>
                            </label>
                          </div>
                        </div>
                        <div class="perfmon-chart-container">
                          <div class="perfmon-y-axis">
                            <span class="axis-label">Duration (ms)</span>
                          </div>
                          <div #perfChart class="perfmon-chart"></div>
                        </div>
                        <div class="perfmon-footer">
                          <span class="footer-note">
                            <i class="fa-solid fa-info-circle"></i>
                            @if (chartTimeRangeStart !== null && chartTimeRangeEnd !== null) {
                              Viewing {{ formatRelativeTime(chartTimeRangeStart) }} - {{ formatRelativeTime(chartTimeRangeEnd) }}. Click Reset to show all.
                            } @else if (chartGapCompression) {
                              Drag to select a time range. Gaps >5s compressed.
                            } @else {
                              Drag to select a time range. Hover over points for details.
                            }
                          </span>
                          @if (telemetrySummary) {
                            <span class="footer-stats">
                              {{ telemetrySummary.totalEvents }} events
                              @if (chartZoomLevel !== 1) {
                                &bull; {{ (chartZoomLevel * 100) | number:'1.0-0' }}% zoom
                              }
                            </span>
                          }
                        </div>
                      </div>
                    }
        
                    <!-- Overview Tab -->
                    @if (perfTab === 'overview') {
                      <!-- Summary Stats -->
                      <div class="telemetry-summary">
                        <div class="summary-card">
                          <div class="summary-value">{{ telemetrySummary?.totalEvents || 0 }}</div>
                          <div class="summary-label">Total Events</div>
                        </div>
                        <div class="summary-card">
                          <div class="summary-value">{{ telemetrySummary?.totalPatterns || 0 }}</div>
                          <div class="summary-label">Unique Patterns</div>
                        </div>
                        <div class="summary-card">
                          <div class="summary-value">{{ telemetrySummary?.totalInsights || 0 }}</div>
                          <div class="summary-label">Insights</div>
                        </div>
                        <div class="summary-card">
                          <div class="summary-value">{{ telemetrySummary?.activeEvents || 0 }}</div>
                          <div class="summary-label">Active</div>
                        </div>
                      </div>
        
                      <!-- Category Breakdown -->
                      @if (telemetrySummary && telemetrySummary.totalEvents > 0) {
                        <div class="category-breakdown">
                          <h4>By Category</h4>
                          <div class="category-grid">
                            @for (cat of categoriesWithData; track cat.name) {
                              <div class="category-item" (click)="jumpToPatternsByCategory(cat.name)">
                                <span class="category-name">{{ cat.name }}</span>
                                <span class="category-events">{{ cat.events }}</span>
                                <span class="category-avg">avg {{ cat.avgMs | number:'1.0-0' }}ms</span>
                              </div>
                            }
                          </div>
                        </div>
                      }
        
                      <!-- Slow Queries Section -->
                      @if (slowQueries.length > 0) {
                        <div class="slow-queries-section">
                          <h4>
                            <i class="fa-solid fa-turtle"></i>
                            Slow Operations (>{{ slowQueryThresholdMs }}ms)
                          </h4>
                          <div class="slow-queries-list">
                            @for (query of slowQueries.slice(0, 10); track query.id) {
                              <div class="slow-query-item clickable" [class.cache-hit]="isCacheHit(query)" (click)="openEventDetailPanel(query)">
                                <div class="slow-query-main">
                                  <span class="category-chip small" [class]="'cat-' + query.category.toLowerCase()">
                                    {{ query.category }}
                                  </span>
                                  <span class="slow-query-entity">{{ query.entityName || query.operation }}</span>
                                  @if (isCacheHit(query)) {
                                    <span class="cache-hit-badge small" title="Data served from local cache">
                                      <i class="fa-solid fa-bolt"></i>
                                      CACHED
                                    </span>
                                  }
                                  <span class="slow-query-time">{{ query.elapsedMs | number:'1.0-0' }}ms</span>
                                </div>
                                <!-- Show entities for RunViews batch operation -->
                                @if (isRunViewsOperation(query)) {
                                  <div class="slow-query-entities">
                                    @for (entity of getRunViewsEntities(query, 4); track entity) {
                                      <span class="entity-pill small">{{ entity }}</span>
                                    }
                                    @if (hasMoreEntities(query, 4)) {
                                      <span class="entity-pill small more">+{{ getRunViewsEntityCount(query) - 4 }} more</span>
                                    }
                                  </div>
                                }
                                <!-- RunView parameter pills -->
                                @if (isRunViewOperation(query) && getRunViewPills(query).length > 0) {
                                  <div class="slow-query-pills">
                                    @for (pill of getRunViewPills(query); track pill.label) {
                                      <span class="param-pill small" [class]="'pill-' + pill.type" [title]="pill.value">
                                        <span class="pill-label">{{ pill.label }}:</span>
                                        <span class="pill-value">{{ pill.value }}</span>
                                      </span>
                                    }
                                  </div>
                                }
                                @if (query.filter) {
                                  <div class="slow-query-filter">{{ truncateString(query.filter, 60) }}</div>
                                }
                                <div class="slow-query-timestamp">{{ formatTimestamp(query.timestamp) }}</div>
                              </div>
                            }
                          </div>
                        </div>
                      } @else if (telemetryEnabled && telemetrySummary && telemetrySummary.totalEvents > 0) {
                        <div class="success-banner">
                          <i class="fa-solid fa-check-circle"></i>
                          <span>No slow operations detected. All operations completed under {{ slowQueryThresholdMs }}ms.</span>
                        </div>
                      }
                    }
        
                    <!-- Events Tab (Timeline) -->
                    @if (perfTab === 'events') {
                      <!-- Filter Bar for Events -->
                      <div class="filter-bar compact">
                        <div class="search-box">
                          <i class="fa-solid fa-search"></i>
                          <input type="text"
                            placeholder="Search events..."
                            [(ngModel)]="searchQuery"
                            (ngModelChange)="onSearchChange()">
                          @if (searchQuery) {
                            <button class="clear-search" (click)="clearSearch()">
                              <i class="fa-solid fa-times"></i>
                            </button>
                          }
                        </div>
                        <div class="filter-buttons">
                          <button class="filter-btn" [class.active]="categoryFilter === 'all'" (click)="setCategoryFilter('all')">
                            All
                          </button>
                          @for (cat of categoriesWithData; track cat.name) {
                            <button class="filter-btn" [class.active]="categoryFilter === cat.name" (click)="setCategoryFilterByName(cat.name)">
                              {{ cat.name }}
                            </button>
                          }
                        </div>
                      </div>
        
                      <div class="timeline-section">
                        <div class="timeline-container">
                          @if (filteredEvents.length > 0) {
                            @for (event of filteredEvents.slice(0, 50); track event.id) {
                              <div class="timeline-item clickable" [class]="'tl-' + event.category.toLowerCase()" [class.cache-hit]="isCacheHit(event)" (click)="openEventDetailPanel(event)">
                                <div class="timeline-marker">
                                  @if (isCacheHit(event)) {
                                    <div class="marker-bolt">
                                      <i class="fa-solid fa-bolt"></i>
                                    </div>
                                  } @else {
                                    <div class="marker-dot"></div>
                                  }
                                  <div class="marker-line"></div>
                                </div>
                                <div class="timeline-content">
                                  <div class="timeline-header">
                                    <span class="timeline-time">{{ formatTimestamp(event.timestamp) }}</span>
                                    <span class="category-chip small" [class]="'cat-' + event.category.toLowerCase()">
                                      {{ event.category }}
                                    </span>
                                    @if (isCacheHit(event)) {
                                      <span class="cache-hit-badge" title="Data served from local cache">
                                        <i class="fa-solid fa-bolt"></i>
                                        CACHED
                                      </span>
                                    }
                                    @if (event.elapsedMs !== undefined) {
                                      <span class="timeline-duration" [class.slow]="(event.elapsedMs || 0) >= slowQueryThresholdMs">
                                        {{ event.elapsedMs | number:'1.0-0' }}ms
                                      </span>
                                    }
                                  </div>
                                  <div class="timeline-body">
                                    <span class="timeline-operation">{{ event.operation }}</span>
                                    @if (event.entityName) {
                                      <span class="timeline-entity">{{ event.entityName }}</span>
                                    }
                                    <!-- Show entities for RunViews batch operation -->
                                    @if (isRunViewsOperation(event)) {
                                      <div class="timeline-entities">
                                        @for (entity of getRunViewsEntities(event, 3); track entity) {
                                          <span class="entity-pill">{{ entity }}</span>
                                        }
                                        @if (hasMoreEntities(event, 3)) {
                                          <span class="entity-pill more">+{{ getRunViewsEntityCount(event) - 3 }} more</span>
                                        }
                                      </div>
                                    }
                                  </div>
                                  <!-- RunView parameter pills -->
                                  @if (isRunViewOperation(event) && getRunViewPills(event).length > 0) {
                                    <div class="timeline-pills">
                                      @for (pill of getRunViewPills(event); track pill.label) {
                                        <span class="param-pill" [class]="'pill-' + pill.type" [title]="pill.value">
                                          <span class="pill-label">{{ pill.label }}:</span>
                                          <span class="pill-value">{{ pill.value }}</span>
                                        </span>
                                      }
                                    </div>
                                  }
                                  @if (event.filter) {
                                    <div class="timeline-filter">{{ truncateString(event.filter, 80) }}</div>
                                  }
                                </div>
                              </div>
                            }
                          } @else {
                            <div class="empty-state small">
                              <i class="fa-solid fa-hourglass-start"></i>
                              <p>No events recorded yet</p>
                            </div>
                          }
                        </div>
                      </div>
                    }
        
                    <!-- Patterns Tab -->
                    @if (perfTab === 'patterns') {
                      <!-- Filter Bar -->
                      <div class="filter-bar compact">
                        <div class="search-box">
                          <i class="fa-solid fa-search"></i>
                          <input type="text"
                            placeholder="Search patterns..."
                            [(ngModel)]="searchQuery"
                            (ngModelChange)="onSearchChange()">
                          @if (searchQuery) {
                            <button class="clear-search" (click)="clearSearch()">
                              <i class="fa-solid fa-times"></i>
                            </button>
                          }
                        </div>
                        <div class="filter-buttons">
                          <button class="filter-btn" [class.active]="categoryFilter === 'all'" (click)="setCategoryFilter('all')">
                            All
                          </button>
                          @for (cat of categoriesWithData; track cat.name) {
                            <button class="filter-btn" [class.active]="categoryFilter === cat.name" (click)="setCategoryFilterByName(cat.name)">
                              {{ cat.name }}
                            </button>
                          }
                        </div>
                      </div>
        
                      @if (filteredPatterns.length > 0) {
                        <div class="patterns-section">
                          <div class="patterns-table-wrapper">
                            <table class="patterns-table sortable">
                              <thead>
                                <tr>
                                  <th class="sortable-header" (click)="sortPatternsBy('category')">
                                    Category
                                    <i class="fa-solid" [class]="getSortIcon('category')"></i>
                                  </th>
                                  <th class="sortable-header" (click)="sortPatternsBy('operation')">
                                    Operation
                                    <i class="fa-solid" [class]="getSortIcon('operation')"></i>
                                  </th>
                                  <th class="sortable-header" (click)="sortPatternsBy('entity')">
                                    Entity/Query
                                    <i class="fa-solid" [class]="getSortIcon('entity')"></i>
                                  </th>
                                  <th>Filter</th>
                                  <th class="sortable-header text-right" (click)="sortPatternsBy('count')">
                                    Count
                                    <i class="fa-solid" [class]="getSortIcon('count')"></i>
                                  </th>
                                  <th class="sortable-header text-right" (click)="sortPatternsBy('avgMs')">
                                    Avg (ms)
                                    <i class="fa-solid" [class]="getSortIcon('avgMs')"></i>
                                  </th>
                                  <th class="sortable-header text-right" (click)="sortPatternsBy('totalMs')">
                                    Total (ms)
                                    <i class="fa-solid" [class]="getSortIcon('totalMs')"></i>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                @for (pattern of filteredPatterns; track pattern.fingerprint) {
                                  <tr [class.duplicate-row]="pattern.count >= 2" [class.slow-row]="pattern.avgElapsedMs >= slowQueryThresholdMs">
                                    <td>
                                      <span class="category-chip" [class]="'cat-' + pattern.category.toLowerCase()">
                                        {{ pattern.category }}
                                      </span>
                                    </td>
                                    <td class="operation-cell">{{ pattern.operation }}</td>
                                    <td class="entity-cell">{{ pattern.entityName || '-' }}</td>
                                    <td class="filter-cell" [title]="pattern.filter || ''">
                                      {{ truncateString(pattern.filter, 30) }}
                                    </td>
                                    <td class="text-right">
                                      @if (pattern.count >= 2) {
                                        <span class="count-warning">{{ pattern.count }}</span>
                                      } @else {
                                        {{ pattern.count }}
                                      }
                                    </td>
                                    <td class="text-right" [class.slow-value]="pattern.avgElapsedMs >= slowQueryThresholdMs">
                                      {{ pattern.avgElapsedMs | number:'1.1-1' }}
                                    </td>
                                    <td class="text-right">{{ pattern.totalElapsedMs | number:'1.0-0' }}</td>
                                  </tr>
                                }
                              </tbody>
                            </table>
                          </div>
                        </div>
                      } @else if (telemetryEnabled && telemetryPatterns.length === 0) {
                        <div class="empty-state">
                          <i class="fa-solid fa-hourglass-start"></i>
                          <p>No telemetry data yet</p>
                          <span class="empty-hint">Navigate around the app to generate performance data</span>
                        </div>
                      } @else if (searchQuery || categoryFilter !== 'all') {
                        <div class="empty-state small">
                          <i class="fa-solid fa-filter"></i>
                          <p>No patterns match your filter</p>
                        </div>
                      }
                    }
        
                    <!-- Insights Tab -->
                    @if (perfTab === 'insights') {
                      @if (telemetryInsights.length > 0) {
                        <div class="insights-section">
                          <div class="insights-list">
                            @for (insight of telemetryInsights; track insight.id) {
                              <div class="insight-card expandable" [class]="getSeverityClass(insight.severity)" [class.expanded]="insight.expanded">
                                <div class="insight-header" (click)="toggleInsightExpanded(insight)">
                                  <i class="fa-solid" [class]="getSeverityIcon(insight.severity)"></i>
                                  <span class="insight-title">{{ insight.title }}</span>
                                  <span class="insight-category">{{ insight.category }}</span>
                                  <i class="fa-solid expand-icon" [class.fa-chevron-down]="!insight.expanded" [class.fa-chevron-up]="insight.expanded"></i>
                                </div>
        
                                <!-- Always show key info for actionability -->
                                <div class="insight-key-info">
                                  @if (insight.entityName) {
                                    <div class="key-info-item">
                                      <span class="key-label">Entity:</span>
                                      <span class="key-value entity-name">{{ insight.entityName }}</span>
                                    </div>
                                  }
                                  @if (getInsightFilter(insight)) {
                                    <div class="key-info-item">
                                      <span class="key-label">Filter:</span>
                                      <code class="key-value filter-code">{{ getInsightFilter(insight) }}</code>
                                    </div>
                                  }
                                </div>
        
                                <div class="insight-message">{{ insight.message }}</div>
                                <div class="insight-suggestion">
                                  <i class="fa-solid fa-arrow-right"></i>
                                  {{ insight.suggestion }}
                                </div>
        
                                <!-- Expanded Details -->
                                @if (insight.expanded) {
                                  <div class="insight-details">
                                    <!-- Show all params from first related event -->
                                    @if (insight.relatedEvents.length > 0) {
                                      <div class="detail-section">
                                        <div class="detail-label">Full Parameters</div>
                                        <div class="params-display">
                                          @for (param of getEventParams(insight.relatedEvents[0]); track param.key) {
                                            <div class="param-row">
                                              <span class="param-key">{{ param.key }}:</span>
                                              <span class="param-value">{{ param.value }}</span>
                                            </div>
                                          }
                                        </div>
                                      </div>
                                      <div class="detail-section">
                                        <div class="detail-label">Related Calls ({{ insight.relatedEvents.length }})</div>
                                        <div class="related-events">
                                          @for (event of insight.relatedEvents; track event.id) {
                                            <div class="related-event">
                                              <span class="event-time">{{ formatTimestamp(event.timestamp) }}</span>
                                              <span class="event-duration">{{ event.elapsedMs | number:'1.0-0' }}ms</span>
                                              @if (event.entityName) {
                                                <span class="event-entity">{{ event.entityName }}</span>
                                              }
                                              @if (event.filter) {
                                                <span class="event-filter">{{ truncateString(event.filter, 40) }}</span>
                                              }
                                            </div>
                                          }
                                        </div>
                                      </div>
                                    }
                                  </div>
                                }
                              </div>
                            }
                          </div>
                        </div>
                      } @else {
                        <div class="empty-state">
                          <i class="fa-solid fa-check-circle" style="color: #4caf50;"></i>
                          <p>No optimization insights</p>
                          <span class="empty-hint">Insights will appear when potential optimizations are detected</span>
                        </div>
                      }
                    }
                  </div>
                </div>
              }
        
              <!-- Local Cache Section -->
              @if (activeSection === 'cache') {
                <div class="section-panel">
                  <div class="panel-header">
                    <h3>
                      <i class="fa-solid fa-database"></i>
                      Local Cache
                    </h3>
                    <div class="panel-actions">
                      <button class="action-btn" (click)="clearAllCache()" [disabled]="!cacheStats || cacheStats.totalEntries === 0">
                        <i class="fa-solid fa-trash"></i>
                        Clear All
                      </button>
                    </div>
                  </div>
        
                  <div class="section-panel-content">
                    @if (!cacheInitialized) {
                      <div class="info-banner warning-banner">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <div>
                          <strong>Cache not initialized.</strong>
                          The LocalCacheManager requires initialization with a storage provider during app startup.
                        </div>
                      </div>
                    } @else {
                      <!-- Cache Summary Stats -->
                      <div class="cache-summary">
                        <div class="summary-card">
                          <div class="summary-value">{{ cacheStats?.totalEntries || 0 }}</div>
                          <div class="summary-label">Total Entries</div>
                        </div>
                        <div class="summary-card">
                          <div class="summary-value">{{ formatBytes(cacheStats?.totalSizeBytes || 0) }}</div>
                          <div class="summary-label">Total Size</div>
                        </div>
                        <div class="summary-card">
                          <div class="summary-value">{{ cacheStats?.hits || 0 }}</div>
                          <div class="summary-label">Cache Hits</div>
                        </div>
                        <div class="summary-card">
                          <div class="summary-value">{{ cacheStats?.misses || 0 }}</div>
                          <div class="summary-label">Cache Misses</div>
                        </div>
                        <div class="summary-card">
                          <div class="summary-value">{{ cacheHitRate | number:'1.1-1' }}%</div>
                          <div class="summary-label">Hit Rate</div>
                        </div>
                      </div>
        
                      <!-- Cache Type Breakdown -->
                      <div class="cache-type-breakdown">
                        <h4>By Type</h4>
                        <div class="type-grid">
                          <div class="type-item" (click)="setCacheTypeFilter('dataset')">
                            <span class="type-icon"><i class="fa-solid fa-layer-group"></i></span>
                            <span class="type-name">Datasets</span>
                            <span class="type-count">{{ cacheStats?.byType?.dataset?.count || 0 }}</span>
                            <span class="type-size">{{ formatBytes(cacheStats?.byType?.dataset?.sizeBytes || 0) }}</span>
                          </div>
                          <div class="type-item" (click)="setCacheTypeFilter('runview')">
                            <span class="type-icon"><i class="fa-solid fa-table"></i></span>
                            <span class="type-name">RunViews</span>
                            <span class="type-count">{{ cacheStats?.byType?.runview?.count || 0 }}</span>
                            <span class="type-size">{{ formatBytes(cacheStats?.byType?.runview?.sizeBytes || 0) }}</span>
                          </div>
                          <div class="type-item" (click)="setCacheTypeFilter('runquery')">
                            <span class="type-icon"><i class="fa-solid fa-code"></i></span>
                            <span class="type-name">RunQueries</span>
                            <span class="type-count">{{ cacheStats?.byType?.runquery?.count || 0 }}</span>
                            <span class="type-size">{{ formatBytes(cacheStats?.byType?.runquery?.sizeBytes || 0) }}</span>
                          </div>
                        </div>
                      </div>
        
                      <!-- Cache Entries Table -->
                      @if (filteredCacheEntries.length > 0) {
                        <div class="cache-entries-section">
                          <div class="section-header">
                            <h4>Cache Entries</h4>
                            <div class="filter-controls">
                              <button class="filter-btn" [class.active]="cacheTypeFilter === 'all'" (click)="setCacheTypeFilter('all')">All</button>
                              <button class="filter-btn" [class.active]="cacheTypeFilter === 'dataset'" (click)="setCacheTypeFilter('dataset')">Datasets</button>
                              <button class="filter-btn" [class.active]="cacheTypeFilter === 'runview'" (click)="setCacheTypeFilter('runview')">RunViews</button>
                              <button class="filter-btn" [class.active]="cacheTypeFilter === 'runquery'" (click)="setCacheTypeFilter('runquery')">RunQueries</button>
                            </div>
                          </div>
                          <div class="cache-entries-table-wrapper">
                            <table class="cache-entries-table">
                              <thead>
                                <tr>
                                  <th>Type</th>
                                  <th>Name</th>
                                  <th class="text-right">Size</th>
                                  <th class="text-right">Hits</th>
                                  <th>Cached At</th>
                                  <th>Last Accessed</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                @for (entry of filteredCacheEntries.slice(0, 50); track entry.key) {
                                  <tr>
                                    <td>
                                      <span class="cache-type-chip" [class]="'type-' + entry.type">
                                        {{ entry.type }}
                                      </span>
                                    </td>
                                    <td class="entry-name">
                                      {{ entry.name }}
                                      @if (entry.fingerprint) {
                                        <code class="entry-fingerprint">{{ truncateString(entry.fingerprint, 20) }}</code>
                                      }
                                    </td>
                                    <td class="text-right">{{ formatBytes(entry.sizeBytes) }}</td>
                                    <td class="text-right">{{ entry.accessCount }}</td>
                                    <td>{{ formatCacheTimestamp(entry.cachedAt) }}</td>
                                    <td>{{ formatCacheTimestamp(entry.lastAccessedAt) }}</td>
                                    <td>
                                      <button class="icon-btn" (click)="invalidateCacheEntry(entry)" title="Invalidate">
                                        <i class="fa-solid fa-times"></i>
                                      </button>
                                    </td>
                                  </tr>
                                }
                              </tbody>
                            </table>
                          </div>
                          @if (filteredCacheEntries.length > 50) {
                            <div class="table-footer">
                              Showing 50 of {{ filteredCacheEntries.length }} entries
                            </div>
                          }
                        </div>
                      } @else if (cacheStats && cacheStats.totalEntries === 0) {
                        <div class="empty-state">
                          <i class="fa-solid fa-database"></i>
                          <p>No cached data</p>
                          <span class="empty-hint">Data will be cached as you use the application</span>
                        </div>
                      }
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        
          <!-- Last Updated -->
          <div class="footer">
            <span class="last-updated">
              <i class="fa-solid fa-clock"></i>
              Last updated: {{ lastUpdated | date:'medium' }}
            </span>
            <button class="export-btn" (click)="exportTelemetryData()" [disabled]="!telemetryEnabled || telemetryEvents.length === 0">
              <i class="fa-solid fa-download"></i>
              Export JSON
            </button>
          </div>
        </div>
        
        <!-- Event Detail Slide-in Panel -->
        @if (eventDetailPanel.isOpen && eventDetailPanel.event) {
          <div class="event-detail-overlay" (click)="closeEventDetailPanel()"></div>
          <div class="event-detail-panel" [class.open]="eventDetailPanel.isOpen">
            <div class="panel-header">
              <div class="panel-title">
                <span class="category-chip" [class]="'cat-' + eventDetailPanel.event.category.toLowerCase()">
                  {{ eventDetailPanel.event.category }}
                </span>
                <h3>Event Details</h3>
              </div>
              <button class="close-btn" (click)="closeEventDetailPanel()">
                <i class="fa-solid fa-times"></i>
              </button>
            </div>
        
            <div class="panel-body">
              <!-- Key Metrics -->
              <div class="detail-metrics">
                <div class="metric">
                  <div class="metric-value" [class.slow]="(eventDetailPanel.event.elapsedMs || 0) >= slowQueryThresholdMs">
                    {{ eventDetailPanel.event.elapsedMs !== undefined ? (eventDetailPanel.event.elapsedMs | number:'1.0-0') + 'ms' : 'In Progress' }}
                  </div>
                  <div class="metric-label">Duration</div>
                </div>
                <div class="metric">
                  <div class="metric-value">{{ formatTimestamp(eventDetailPanel.event.timestamp) }}</div>
                  <div class="metric-label">Time</div>
                </div>
                <div class="metric">
                  <div class="metric-value">+{{ formatRelativeTime(eventDetailPanel.event.startTime - telemetryBootTime) }}</div>
                  <div class="metric-label">Relative</div>
                </div>
              </div>
        
              <!-- Operation Info -->
              <div class="detail-section">
                <h4><i class="fa-solid fa-code"></i> Operation</h4>
                <div class="detail-content">
                  <div class="detail-row">
                    <span class="detail-key">Operation:</span>
                    <span class="detail-val">{{ eventDetailPanel.event.operation }}</span>
                  </div>
                  @if (eventDetailPanel.event.entityName) {
                    <div class="detail-row">
                      <span class="detail-key">Entity:</span>
                      <span class="detail-val entity-highlight">{{ eventDetailPanel.event.entityName }}</span>
                    </div>
                  }
                  @if (eventDetailPanel.event.filter) {
                    <div class="detail-row">
                      <span class="detail-key">Filter:</span>
                      <code class="detail-val filter-val">{{ eventDetailPanel.event.filter }}</code>
                    </div>
                  }
                </div>
              </div>
        
              <!-- All Parameters -->
              <div class="detail-section">
                <h4><i class="fa-solid fa-sliders"></i> Parameters</h4>
                <div class="params-grid">
                  @for (param of getEventParams(eventDetailPanel.event); track param.key) {
                    <div class="param-item">
                      <span class="param-name">{{ param.key }}</span>
                      <span class="param-val">{{ param.value }}</span>
                    </div>
                  }
                </div>
              </div>
        
              <!-- Related Pattern -->
              @if (eventDetailPanel.relatedPattern) {
                <div class="detail-section">
                  <h4><i class="fa-solid fa-fingerprint"></i> Related Pattern</h4>
                  <div class="pattern-summary">
                    <div class="pattern-stat">
                      <span class="stat-val">{{ eventDetailPanel.relatedPattern.count }}</span>
                      <span class="stat-label">Total Calls</span>
                    </div>
                    <div class="pattern-stat">
                      <span class="stat-val">{{ eventDetailPanel.relatedPattern.avgElapsedMs | number:'1.1-1' }}ms</span>
                      <span class="stat-label">Avg Duration</span>
                    </div>
                    <div class="pattern-stat">
                      <span class="stat-val">{{ eventDetailPanel.relatedPattern.minElapsedMs | number:'1.0-0' }} - {{ eventDetailPanel.relatedPattern.maxElapsedMs | number:'1.0-0' }}ms</span>
                      <span class="stat-label">Range</span>
                    </div>
                  </div>
                  @if (eventDetailPanel.relatedPattern.count >= 2) {
                    <div class="pattern-warning">
                      <i class="fa-solid fa-exclamation-triangle"></i>
                      This pattern has been called {{ eventDetailPanel.relatedPattern.count }} times. Consider caching or batching.
                    </div>
                  }
                </div>
              }
        
              <!-- Actions -->
              <div class="detail-actions">
                <button class="action-button" (click)="copyEventToClipboard(eventDetailPanel.event)">
                  <i class="fa-solid fa-copy"></i>
                  Copy JSON
                </button>
                @if (eventDetailPanel.event.entityName) {
                  <button class="action-button" (click)="filterByEntity(eventDetailPanel.event.entityName)">
                    <i class="fa-solid fa-filter"></i>
                    Filter by Entity
                  </button>
                }
              </div>
            </div>
          </div>
        }
        
        <!-- Engine Detail Slide-in Panel -->
        @if (engineDetailPanel.isOpen && engineDetailPanel.engine) {
          <div class="engine-detail-overlay" (click)="closeEngineDetailPanel()"></div>
          <div class="engine-detail-panel" [class.open]="engineDetailPanel.isOpen">
            <div class="panel-header">
              <div class="panel-title">
                <i class="fa-solid fa-cogs"></i>
                <h3>{{ engineDetailPanel.engine.className }}</h3>
              </div>
              <div class="panel-header-actions">
                <button class="icon-btn" (click)="refreshEngineInDetailPanel()" [disabled]="engineDetailPanel.isRefreshing" title="Refresh engine">
                  <i class="fa-solid fa-sync" [class.spinning]="engineDetailPanel.isRefreshing"></i>
                </button>
                <button class="close-btn" (click)="closeEngineDetailPanel()">
                  <i class="fa-solid fa-times"></i>
                </button>
              </div>
            </div>
        
            <div class="panel-body">
              <!-- Engine Summary -->
              <div class="engine-summary-section">
                <div class="summary-stat">
                  <span class="summary-label">Status</span>
                  <span class="summary-value">
                    <span class="status-dot" [class.status-loaded]="engineDetailPanel.engine.isLoaded"></span>
                    {{ engineDetailPanel.engine.isLoaded ? 'Loaded' : 'Not Loaded' }}
                  </span>
                </div>
                <div class="summary-stat">
                  <span class="summary-label">Memory</span>
                  <span class="summary-value">{{ engineDetailPanel.engine.memoryDisplay }}</span>
                </div>
                <div class="summary-stat">
                  <span class="summary-label">Items</span>
                  <span class="summary-value">{{ engineDetailPanel.engine.itemCount.toLocaleString() }}</span>
                </div>
                @if (engineDetailPanel.engine.lastLoadedAt) {
                  <div class="summary-stat">
                    <span class="summary-label">Last Loaded</span>
                    <span class="summary-value">{{ formatTime(engineDetailPanel.engine.lastLoadedAt) }}</span>
                  </div>
                }
              </div>
        
              <!-- Config Items -->
              <div class="config-items-section">
                <h4>
                  <i class="fa-solid fa-database"></i>
                  Data Configs ({{ engineDetailPanel.configItems.length }})
                </h4>
        
                @if (engineDetailPanel.configItems.length === 0) {
                  <div class="empty-state small">
                    <i class="fa-solid fa-inbox"></i>
                    <p>No config items found</p>
                  </div>
                } @else {
                  <div class="config-items-list">
                    @for (item of engineDetailPanel.configItems; track item.propertyName) {
                      <div class="config-item" [class.expanded]="item.expanded">
                        <div class="config-item-header" (click)="toggleConfigItemExpanded(item)">
                          <div class="config-item-info">
                            <span class="config-type-chip" [class]="'type-' + item.type">{{ item.type }}</span>
                            <span class="config-name">{{ item.entityName || item.datasetName || item.propertyName }}</span>
                          </div>
                          <div class="config-item-stats">
                            <span class="config-stat">{{ item.itemCount }} items</span>
                            <span class="config-stat">{{ item.memoryDisplay }}</span>
                            <i class="fa-solid expand-icon" [class.fa-chevron-down]="!item.expanded" [class.fa-chevron-up]="item.expanded"></i>
                          </div>
                        </div>
        
                        @if (item.expanded) {
                          <div class="config-item-details">
                            <div class="config-detail-row">
                              <span class="detail-label">Property:</span>
                              <code class="detail-value">{{ item.propertyName }}</code>
                            </div>
                            @if (item.filter) {
                              <div class="config-detail-row">
                                <span class="detail-label">Filter:</span>
                                <code class="detail-value">{{ item.filter }}</code>
                              </div>
                            }
                            @if (item.orderBy) {
                              <div class="config-detail-row">
                                <span class="detail-label">Order By:</span>
                                <code class="detail-value">{{ item.orderBy }}</code>
                              </div>
                            }
        
                            <!-- Data Table with Paging -->
                            @if (item.displayedData.length > 0) {
                              <div class="sample-data-section">
                                <div class="sample-header">
                                  <span class="sample-title">Data ({{ item.displayedData.length }} of {{ item.itemCount }})</span>
                                  <div class="sample-header-actions">
                                    @if (!item.allDataLoaded && item.itemCount > item.displayedData.length) {
                                      <button class="load-more-btn" (click)="loadMoreData(item)" [disabled]="item.isLoadingMore" title="Load more records">
                                        @if (item.isLoadingMore) {
                                          <i class="fa-solid fa-spinner spinning"></i>
                                        } @else {
                                          <i class="fa-solid fa-plus"></i>
                                        }
                                        Load More
                                      </button>
                                      <button class="load-all-btn" (click)="loadAllData(item)" [disabled]="item.isLoadingMore" title="Load all records">
                                        @if (item.isLoadingMore) {
                                          <i class="fa-solid fa-spinner spinning"></i>
                                        } @else {
                                          <i class="fa-solid fa-download"></i>
                                        }
                                        Load All
                                      </button>
                                    }
                                    @if (item.allDataLoaded) {
                                      <span class="all-loaded-badge">
                                        <i class="fa-solid fa-check"></i>
                                        All Loaded
                                      </span>
                                    }
                                  </div>
                                </div>
                                <div class="sample-data-table-wrapper">
                                  <table class="sample-data-table">
                                    <thead>
                                      <tr>
                                        <th class="action-col"></th>
                                        @for (col of getSampleDataColumns(item); track col) {
                                          <th>{{ col }}</th>
                                        }
                                      </tr>
                                    </thead>
                                    <tbody>
                                      @for (row of item.displayedData; track $index) {
                                        <tr>
                                          <td class="action-col">
                                            @if (item.entityName && getRecordId(row)) {
                                              <button class="open-record-btn" (click)="openEntityRecord(item.entityName, row)" title="Open record">
                                                <i class="fa-solid fa-external-link-alt"></i>
                                              </button>
                                            }
                                          </td>
                                          @for (col of getSampleDataColumns(item); track col) {
                                            <td [title]="getSampleDataValue(row, col)">{{ truncateString(getSampleDataValue(row, col), 30) }}</td>
                                          }
                                        </tr>
                                      }
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        }
        `,
    styles: [`
        .system-diagnostics {
            padding: 0;
            background: #f8f9fa;
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Header */
        .diagnostics-header {
            background: white;
            padding: 20px 24px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            flex-shrink: 0;
        }

        .header-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header-title i {
            font-size: 24px;
            color: #4caf50;
        }

        .header-title h2 {
            margin: 0;
            font-size: 22px;
            font-weight: 600;
            color: #333;
        }

        .header-controls {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .auto-refresh-control {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 13px;
            color: #666;
        }

        .auto-refresh-control label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }

        .auto-refresh-control input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }

        .refresh-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #4caf50;
            font-size: 12px;
        }

        .refresh-btn {
            background: #4caf50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
        }

        .refresh-btn:hover:not(:disabled) {
            background: #43a047;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
        }

        .refresh-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .spinning {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Overview Cards Container (Collapsible) */
        .overview-cards-container {
            position: relative;
            background: white;
            border-bottom: 1px solid #e0e0e0;
            flex-shrink: 0;
            transition: all 0.3s ease;
        }

        .overview-cards-container.collapsed {
            padding: 0;
        }

        .kpi-toggle-btn {
            position: absolute;
            right: 24px;
            top: 50%;
            transform: translateY(-50%);
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: 1px solid #e0e0e0;
            background: white;
            color: #666;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            transition: all 0.2s ease;
            z-index: 10;
        }

        .kpi-toggle-btn:hover {
            background: #f5f5f5;
            border-color: #ccc;
            color: #333;
        }

        .overview-cards-container.collapsed .kpi-toggle-btn {
            top: 50%;
        }

        /* Overview Cards */
        .overview-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            padding: 20px 24px;
            padding-right: 60px;
            background: white;
            flex-shrink: 0;
        }

        /* Mini KPI Bar (Collapsed State) */
        .overview-cards-mini {
            display: flex;
            align-items: center;
            gap: 24px;
            padding: 10px 60px 10px 24px;
            background: white;
        }

        .mini-kpi {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #666;
        }

        .mini-kpi i {
            font-size: 14px;
            color: #667eea;
        }

        .mini-kpi.warning i {
            color: #ff9800;
        }

        .mini-value {
            font-size: 14px;
            font-weight: 600;
            color: #333;
        }

        .mini-label {
            font-size: 12px;
            color: #888;
        }

        .mini-divider {
            width: 1px;
            height: 20px;
            background: #e0e0e0;
        }

        .overview-card {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 20px;
            background: #f8f9fa;
            border-radius: 10px;
            transition: all 0.2s ease;
        }

        .overview-card:hover {
            background: #f0f4f8;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .card-icon {
            width: 52px;
            height: 52px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            flex-shrink: 0;
        }

        .card-icon--engines {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .card-icon--memory {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }

        .card-icon--warning {
            background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
            color: white;
        }

        .card-icon--success {
            background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
            color: white;
        }

        .card-content {
            flex: 1;
            min-width: 0;
        }

        .card-value {
            font-size: 22px;
            font-weight: 700;
            color: #333;
            line-height: 1.2;
        }

        .card-label {
            font-size: 13px;
            color: #666;
            margin-top: 2px;
        }

        .card-subtitle {
            font-size: 11px;
            color: #999;
            margin-top: 2px;
        }

        /* Main Content */
        .main-content {
            display: flex;
            flex: 1;
            min-height: 0;
        }

        /* Left Navigation */
        .left-nav {
            width: 240px;
            background: white;
            border-right: 1px solid #e0e0e0;
            padding: 16px 0;
            flex-shrink: 0;
        }

        .nav-section {
            padding: 0 12px;
        }

        .nav-section-title {
            font-size: 11px;
            font-weight: 600;
            color: #999;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 12px;
            margin-bottom: 4px;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            border-radius: 8px;
            cursor: pointer;
            color: #666;
            font-size: 14px;
            transition: all 0.2s ease;
            margin-bottom: 4px;
        }

        .nav-item:hover {
            background: #f0f4f8;
            color: #333;
        }

        .nav-item.active {
            background: #e8f5e9;
            color: #2e7d32;
            font-weight: 500;
        }

        .nav-item i {
            width: 18px;
            text-align: center;
            font-size: 15px;
        }

        .nav-item span:first-of-type {
            flex: 1;
        }

        .nav-badge {
            background: #e0e0e0;
            color: #666;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 10px;
            min-width: 24px;
            text-align: center;
        }

        .nav-item.active .nav-badge {
            background: #4caf50;
            color: white;
        }

        .nav-badge--warning {
            background: #ff9800 !important;
            color: white !important;
        }

        .nav-badge--success {
            background: #4caf50 !important;
            color: white !important;
        }

        /* Content Area */
        .content-area {
            flex: 1;
            padding: 24px;
            overflow: hidden;
            min-width: 0;
            display: flex;
            flex-direction: column;
        }

        .section-panel {
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
        }

        .section-panel-content {
            flex: 1;
            overflow-y: auto;
            min-height: 0;
            padding: 20px 24px;
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #f0f0f0;
            background: #fafafa;
        }

        .panel-header h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .panel-header h3 i {
            color: #4caf50;
        }

        .panel-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .action-divider {
            width: 1px;
            height: 24px;
            background: #ddd;
        }

        .source-toggle {
            display: flex;
            background: #e8e8e8;
            border-radius: 6px;
            overflow: hidden;
        }

        .source-btn {
            background: transparent;
            border: none;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 500;
            color: #666;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.15s ease;
        }

        .source-btn:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        .source-btn.active {
            background: #4caf50;
            color: white;
        }

        .source-btn i {
            font-size: 11px;
        }

        .loading-indicator {
            display: flex;
            align-items: center;
            color: #4caf50;
        }

        .error-banner {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 16px;
            background: #ffebee;
            border: 1px solid #ffcdd2;
            border-radius: 6px;
            color: #c62828;
            font-size: 13px;
            margin-bottom: 16px;
        }

        .error-banner i {
            color: #e53935;
        }

        .error-banner .dismiss-btn {
            margin-left: auto;
            background: transparent;
            border: none;
            color: #999;
            cursor: pointer;
            padding: 4px;
        }

        .error-banner .dismiss-btn:hover {
            color: #c62828;
        }

        .action-btn {
            background: #f0f0f0;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            color: #666;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }

        .action-btn:hover:not(:disabled) {
            background: #e0e0e0;
            color: #333;
        }

        .action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Status indicator for read-only server telemetry status */
        .status-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
        }

        .status-indicator.enabled {
            background: rgba(76, 175, 80, 0.1);
            color: #4caf50;
        }

        .status-indicator.disabled {
            background: rgba(158, 158, 158, 0.1);
            color: #9e9e9e;
        }

        .status-indicator .config-note {
            font-size: 11px;
            opacity: 0.7;
            margin-left: 4px;
        }

        /* Empty State */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            color: #999;
        }

        .empty-state i {
            font-size: 48px;
            margin-bottom: 16px;
            color: #ddd;
        }

        .empty-state.success-state i {
            color: #4caf50;
        }

        .empty-state p {
            margin: 0;
            font-size: 16px;
            color: #666;
        }

        .empty-hint {
            font-size: 13px;
            margin-top: 8px;
        }

        /* Engine Grid */
        .engine-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 16px;
        }

        .engine-card {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 16px 20px;
            border: 2px solid transparent;
            transition: all 0.2s ease;
        }

        .engine-card.loaded {
            border-color: #4caf50;
            background: #f1f8e9;
        }

        .engine-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .engine-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .engine-name {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 180px;
            flex: 1;
            min-width: 0;
        }

        .engine-status {
            flex-shrink: 0;
            font-size: 11px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 12px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .status-loaded {
            background: #c8e6c9;
            color: #2e7d32;
        }

        .status-pending {
            background: #fff3e0;
            color: #ef6c00;
        }

        .engine-stats {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: #666;
        }

        .stat-item i {
            width: 16px;
            color: #999;
        }

        .engine-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid rgba(0, 0, 0, 0.08);
        }

        .engine-action-btn {
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.05);
            color: #666;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .engine-action-btn:hover:not(:disabled) {
            background: #4caf50;
            color: white;
        }

        .engine-action-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .stat-label {
            color: #999;
        }

        .stat-value {
            font-weight: 500;
            color: #333;
        }

        /* Info Banner */
        .info-banner {
            display: flex;
            gap: 12px;
            padding: 16px 20px;
            background: #e3f2fd;
            border-radius: 8px;
            font-size: 13px;
            color: #1565c0;
            margin-bottom: 20px;
        }

        .info-banner i {
            margin-top: 2px;
            flex-shrink: 0;
        }

        /* Recommendation Banner */
        .recommendation-banner {
            display: flex;
            gap: 12px;
            padding: 16px 20px;
            background: #fff3e0;
            border-radius: 8px;
            font-size: 13px;
            color: #e65100;
            margin-top: 20px;
        }

        .recommendation-banner i {
            margin-top: 2px;
            flex-shrink: 0;
            color: #ff9800;
        }

        /* Redundant Loads Table */
        .redundant-loads-table-wrapper {
            overflow-x: auto;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }

        .redundant-loads-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .redundant-loads-table th {
            background: #f8f9fa;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            color: #666;
            border-bottom: 1px solid #e0e0e0;
            white-space: nowrap;
        }

        .redundant-loads-table th.text-right {
            text-align: right;
        }

        .redundant-loads-table td {
            padding: 12px 16px;
            border-bottom: 1px solid #f0f0f0;
            color: #333;
        }

        .redundant-loads-table td.text-right {
            text-align: right;
        }

        .redundant-loads-table tbody tr:last-child td {
            border-bottom: none;
        }

        .redundant-loads-table tbody tr:hover {
            background: #f8f9fa;
        }

        .redundant-loads-table .entity-name {
            font-weight: 500;
            color: #333;
        }

        .engine-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .engine-chip {
            padding: 4px 10px;
            background: #667eea;
            color: white;
            font-size: 11px;
            border-radius: 12px;
            font-weight: 500;
        }

        .count-badge {
            display: inline-block;
            padding: 4px 12px;
            background: #ff9800;
            color: white;
            font-size: 12px;
            font-weight: 600;
            border-radius: 12px;
        }

        /* Footer */
        .footer {
            padding: 12px 24px;
            background: white;
            border-top: 1px solid #e0e0e0;
            text-align: right;
            flex-shrink: 0;
        }

        .last-updated {
            font-size: 12px;
            color: #999;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        /* Performance Section Styles */
        .warning-banner {
            background: #fff3e0 !important;
            color: #e65100 !important;
        }

        .warning-banner i {
            color: #ff9800;
        }

        .telemetry-summary {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }

        .summary-card {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 16px;
            text-align: center;
        }

        .summary-value {
            font-size: 28px;
            font-weight: 700;
            color: #333;
        }

        .summary-label {
            font-size: 12px;
            color: #666;
            margin-top: 4px;
        }

        .category-breakdown {
            margin-bottom: 24px;
        }

        .category-breakdown h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: #666;
        }

        .category-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }

        .category-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: #f0f4f8;
            border-radius: 20px;
            font-size: 13px;
        }

        .category-name {
            font-weight: 600;
            color: #333;
        }

        .category-events {
            background: #667eea;
            color: white;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
        }

        .category-avg {
            color: #999;
            font-size: 11px;
        }

        .insights-section {
            margin-bottom: 24px;
        }

        .insights-section h4 {
            margin: 0 0 16px 0;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .insights-section h4 i {
            color: #ff9800;
        }

        .insights-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .insight-card {
            padding: 16px;
            border-radius: 8px;
            border-left: 4px solid #ccc;
        }

        .insight-card.severity-info {
            background: #e3f2fd;
            border-left-color: #2196f3;
        }

        .insight-card.severity-warning {
            background: #fff3e0;
            border-left-color: #ff9800;
        }

        .insight-card.severity-optimization {
            background: #e8f5e9;
            border-left-color: #4caf50;
        }

        .insight-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }

        .insight-header i {
            font-size: 16px;
        }

        .severity-info .insight-header i { color: #2196f3; }
        .severity-warning .insight-header i { color: #ff9800; }
        .severity-optimization .insight-header i { color: #4caf50; }

        .insight-title {
            font-weight: 600;
            color: #333;
            flex: 1;
        }

        .insight-category {
            font-size: 11px;
            padding: 2px 8px;
            background: rgba(0,0,0,0.1);
            border-radius: 10px;
            color: #666;
        }

        .insight-message {
            font-size: 13px;
            color: #555;
            margin-bottom: 8px;
        }

        .insight-suggestion {
            font-size: 12px;
            color: #666;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .insight-suggestion i {
            color: #4caf50;
            font-size: 10px;
        }

        .patterns-section h4 {
            margin: 0 0 16px 0;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .patterns-section h4 i {
            color: #667eea;
        }

        .patterns-table-wrapper {
            overflow-x: auto;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }

        .patterns-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .patterns-table th {
            background: #f8f9fa;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            color: #666;
            border-bottom: 1px solid #e0e0e0;
            white-space: nowrap;
        }

        .patterns-table td {
            padding: 12px 16px;
            border-bottom: 1px solid #f0f0f0;
            color: #333;
        }

        .patterns-table tbody tr:last-child td {
            border-bottom: none;
        }

        .patterns-table tbody tr:hover {
            background: #f8f9fa;
        }

        .duplicate-row {
            background: #fff3e0;
        }

        .duplicate-row:hover {
            background: #ffe0b2 !important;
        }

        .category-chip {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .cat-runview { background: #e3f2fd; color: #1565c0; }
        .cat-runquery { background: #f3e5f5; color: #7b1fa2; }
        .cat-engine { background: #e8f5e9; color: #2e7d32; }
        .cat-ai { background: #fff3e0; color: #e65100; }
        .cat-cache { background: #fce4ec; color: #c2185b; }
        .cat-network { background: #e0f2f1; color: #00695c; }
        .cat-custom { background: #f5f5f5; color: #616161; }

        .operation-cell {
            font-family: monospace;
            font-size: 12px;
        }

        .entity-cell {
            font-weight: 500;
        }

        .count-warning {
            display: inline-block;
            padding: 2px 8px;
            background: #ff9800;
            color: white;
            border-radius: 10px;
            font-weight: 600;
        }

        .action-btn.active {
            background: #4caf50;
            color: white;
        }

        /* Slow Queries Section */
        .slow-queries-section {
            margin-bottom: 24px;
            background: #fff8e1;
            border-radius: 8px;
            padding: 16px;
            border-left: 4px solid #ff9800;
        }

        .slow-queries-section h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: #e65100;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .slow-queries-section h4 i {
            color: #ff9800;
        }

        .slow-queries-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .slow-query-item {
            background: white;
            border-radius: 6px;
            padding: 10px 12px;
            border: 1px solid #ffe0b2;
            transition: all 0.15s ease;
        }

        .slow-query-item.clickable {
            cursor: pointer;
        }

        .slow-query-item.clickable:hover {
            background: #fff8e1;
            border-color: #ffb74d;
            transform: translateX(2px);
        }

        .slow-query-main {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .slow-query-entity {
            flex: 1;
            font-weight: 500;
            color: #333;
        }

        .slow-query-time {
            font-weight: 700;
            color: #e65100;
            font-size: 14px;
        }

        .slow-query-filter {
            font-size: 11px;
            color: #666;
            margin-top: 4px;
            font-family: monospace;
        }

        .slow-query-timestamp {
            font-size: 11px;
            color: #999;
            margin-top: 4px;
        }

        /* View Toggle */
        .view-toggle {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
        }

        .toggle-btn {
            padding: 8px 16px;
            border: 1px solid #e0e0e0;
            background: white;
            border-radius: 6px;
            font-size: 13px;
            color: #666;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }

        .toggle-btn:hover {
            background: #f5f5f5;
        }

        .toggle-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        /* Expandable Insight Cards */
        .insight-card.expandable {
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .insight-card.expandable:hover {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .insight-card .expand-icon {
            color: #999;
            font-size: 12px;
            margin-left: auto;
        }

        .insight-card.expanded {
            border-width: 2px;
        }

        .insight-details {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid rgba(0, 0, 0, 0.1);
        }

        .detail-section {
            margin-bottom: 12px;
        }

        .detail-label {
            font-size: 11px;
            font-weight: 600;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 4px;
        }

        .detail-value {
            font-size: 13px;
            color: #333;
        }

        .related-events {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 200px;
            overflow-y: auto;
        }

        .related-event {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 6px 10px;
            background: rgba(0, 0, 0, 0.03);
            border-radius: 4px;
            font-size: 12px;
        }

        .event-time {
            font-family: monospace;
            color: #666;
        }

        .event-duration {
            font-weight: 600;
            color: #333;
        }

        .event-filter {
            color: #999;
            font-family: monospace;
            font-size: 11px;
        }

        /* Timeline Section */
        .timeline-section h4 {
            margin: 0 0 16px 0;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .timeline-section h4 i {
            color: #667eea;
        }

        .timeline-container {
            position: relative;
            padding-left: 24px;
            max-height: 400px;
            overflow-y: auto;
        }

        .timeline-item {
            display: flex;
            gap: 16px;
            margin-bottom: 12px;
            position: relative;
        }

        .timeline-marker {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: absolute;
            left: -24px;
            top: 0;
            bottom: 0;
        }

        .marker-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #667eea;
            z-index: 1;
        }

        .marker-line {
            width: 2px;
            flex: 1;
            background: #e0e0e0;
            margin-top: 4px;
        }

        .timeline-item:last-child .marker-line {
            display: none;
        }

        .tl-runview .marker-dot { background: #1565c0; }
        .tl-runquery .marker-dot { background: #7b1fa2; }
        .tl-engine .marker-dot { background: #2e7d32; }
        .tl-ai .marker-dot { background: #e65100; }
        .tl-cache .marker-dot { background: #c2185b; }

        /* Cache hit bolt marker */
        .marker-bolt {
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
            color: #f59e0b;
            font-size: 14px;
            margin-left: -4px;
        }

        .marker-bolt i {
            filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.6));
        }

        /* Category-specific bolt colors */
        .tl-runview.cache-hit .marker-bolt { color: #1565c0; }
        .tl-runquery.cache-hit .marker-bolt { color: #7b1fa2; }
        .tl-engine.cache-hit .marker-bolt { color: #2e7d32; }
        .tl-ai.cache-hit .marker-bolt { color: #e65100; }
        .tl-cache.cache-hit .marker-bolt { color: #c2185b; }

        /* Cache hit badge */
        .cache-hit-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 1px solid #f59e0b;
            border-radius: 10px;
            font-size: 9px;
            font-weight: 700;
            color: #92400e;
            letter-spacing: 0.5px;
        }

        .cache-hit-badge i {
            font-size: 8px;
            color: #f59e0b;
        }

        /* Highlighted background for cache hit items */
        .timeline-item.cache-hit .timeline-content {
            background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
            border: 1px solid #fde047;
        }

        .timeline-content {
            flex: 1;
            background: #f8f9fa;
            border-radius: 6px;
            padding: 10px 14px;
        }

        .timeline-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 4px;
        }

        .timeline-time {
            font-family: monospace;
            font-size: 11px;
            color: #999;
        }

        .timeline-duration {
            font-size: 12px;
            font-weight: 600;
            color: #333;
        }

        .timeline-duration.slow {
            color: #e65100;
            background: #fff3e0;
            padding: 2px 6px;
            border-radius: 4px;
        }

        .timeline-body {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .timeline-operation {
            font-family: monospace;
            font-size: 12px;
            color: #666;
        }

        .timeline-entity {
            font-weight: 500;
            color: #333;
        }

        .timeline-filter {
            font-size: 11px;
            color: #999;
            font-family: monospace;
            margin-top: 4px;
        }

        /* Entity Pills for RunViews batch operations */
        .timeline-entities,
        .slow-query-entities {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 4px;
        }

        .entity-pill {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            background: #e3f2fd;
            border: 1px solid #90caf9;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            color: #1565c0;
        }

        .entity-pill.small {
            padding: 1px 6px;
            font-size: 10px;
        }

        .entity-pill.more {
            background: #f5f5f5;
            border-color: #e0e0e0;
            color: #757575;
            font-style: italic;
        }

        /* Parameter Pills */
        .timeline-pills,
        .slow-query-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
        }

        .param-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .param-pill.small {
            padding: 2px 6px;
            font-size: 9px;
            max-width: 150px;
        }

        .param-pill .pill-label {
            font-weight: 600;
            opacity: 0.8;
        }

        .param-pill .pill-value {
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Pill type colors */
        .param-pill.pill-filter {
            background: #fff3e0;
            border: 1px solid #ffcc80;
            color: #e65100;
        }

        .param-pill.pill-order {
            background: #e8f5e9;
            border: 1px solid #a5d6a7;
            color: #2e7d32;
        }

        .param-pill.pill-result {
            background: #f3e5f5;
            border: 1px solid #ce93d8;
            color: #7b1fa2;
        }

        .param-pill.pill-limit {
            background: #e3f2fd;
            border: 1px solid #90caf9;
            color: #1565c0;
        }

        .param-pill.pill-batch {
            background: #fce4ec;
            border: 1px solid #f48fb1;
            color: #c2185b;
        }

        .param-pill.pill-info {
            background: #f5f5f5;
            border: 1px solid #e0e0e0;
            color: #616161;
        }

        /* Slow query cache hit styling */
        .slow-query-item.cache-hit {
            background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
            border-color: #fde047;
        }

        .cache-hit-badge.small {
            padding: 1px 6px;
            font-size: 8px;
        }

        /* Filter Bar */
        .filter-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 16px;
            padding: 12px 16px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .search-box {
            flex: 1;
            min-width: 200px;
            position: relative;
            display: flex;
            align-items: center;
        }

        .search-box i {
            position: absolute;
            left: 12px;
            color: #999;
        }

        .search-box input {
            width: 100%;
            padding: 8px 36px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            font-size: 13px;
            background: white;
        }

        .search-box input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }

        .clear-search {
            position: absolute;
            right: 8px;
            background: none;
            border: none;
            color: #999;
            cursor: pointer;
            padding: 4px;
        }

        .clear-search:hover {
            color: #666;
        }

        .filter-buttons {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .filter-btn {
            padding: 6px 14px;
            border: 1px solid #e0e0e0;
            background: white;
            border-radius: 16px;
            font-size: 12px;
            color: #666;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .filter-btn:hover {
            background: #f0f0f0;
        }

        .filter-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        /* Sortable Table Headers */
        .sortable-header {
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }

        .sortable-header:hover {
            background: #f0f0f0;
        }

        .sortable-header i {
            margin-left: 6px;
            font-size: 11px;
            color: #999;
        }

        .sortable-header i.fa-sort-up,
        .sortable-header i.fa-sort-down {
            color: #667eea;
        }

        /* Table Enhancements */
        .filter-cell {
            font-family: monospace;
            font-size: 11px;
            color: #666;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .slow-row {
            background: #ffebee;
        }

        .slow-row:hover {
            background: #ffcdd2 !important;
        }

        .slow-value {
            color: #c62828;
            font-weight: 600;
        }

        /* Small category chips */
        .category-chip.small {
            font-size: 9px;
            padding: 2px 6px;
        }

        /* Small empty state */
        .empty-state.small {
            padding: 30px 20px;
        }

        .empty-state.small i {
            font-size: 32px;
            margin-bottom: 12px;
        }

        .empty-state.small p {
            font-size: 14px;
        }

        /* Performance Sub-Tabs */
        .perf-tabs {
            display: flex;
            gap: 4px;
            padding: 12px 24px;
            background: #f5f5f5;
            border-bottom: 1px solid #e0e0e0;
        }

        .perf-tab {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border: none;
            background: transparent;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            color: #666;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .perf-tab:hover {
            background: #e8e8e8;
            color: #333;
        }

        .perf-tab.active {
            background: white;
            color: #4caf50;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .perf-tab i {
            font-size: 14px;
        }

        .tab-badge {
            background: #e0e0e0;
            color: #666;
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 8px;
            min-width: 18px;
            text-align: center;
        }

        .perf-tab.active .tab-badge {
            background: #c8e6c9;
            color: #2e7d32;
        }

        .tab-badge.warning {
            background: #fff3e0;
            color: #e65100;
        }

        .tab-badge.insight {
            background: #fff8e1;
            color: #f57f17;
        }

        .perf-panel .section-panel-content {
            padding: 20px 24px;
        }

        /* Success Banner */
        .success-banner {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 20px;
            background: #e8f5e9;
            border-radius: 8px;
            font-size: 13px;
            color: #2e7d32;
            margin-top: 16px;
        }

        .success-banner i {
            font-size: 18px;
            color: #4caf50;
        }

        /* Compact Filter Bar */
        .filter-bar.compact {
            padding: 10px 14px;
            margin-bottom: 12px;
        }

        /* Clickable category items */
        .category-item {
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .category-item:hover {
            background: #e3f2fd;
            transform: translateY(-1px);
        }

        /* Insight Key Info (always visible) */
        .insight-key-info {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px 12px;
            background: rgba(0, 0, 0, 0.03);
            border-radius: 6px;
            margin: 8px 0;
            border-left: 3px solid #2196f3;
        }

        .key-info-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            font-size: 12px;
        }

        .key-label {
            color: #666;
            font-weight: 500;
            min-width: 50px;
            flex-shrink: 0;
        }

        .key-value {
            color: #333;
            word-break: break-all;
        }

        .key-value.entity-name {
            font-weight: 600;
            color: #1565c0;
        }

        .key-value.filter-code {
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 11px;
            background: rgba(0, 0, 0, 0.06);
            padding: 2px 6px;
            border-radius: 3px;
            color: #333;
        }

        /* Params Display */
        .params-display {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 10px;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 11px;
            max-height: 200px;
            overflow-y: auto;
        }

        .param-row {
            display: flex;
            gap: 8px;
            padding: 4px 0;
            border-bottom: 1px solid #eee;
        }

        .param-row:last-child {
            border-bottom: none;
        }

        .param-key {
            color: #6f42c1;
            font-weight: 500;
            min-width: 100px;
            flex-shrink: 0;
        }

        .param-value {
            color: #333;
            word-break: break-all;
        }

        .event-entity {
            background: #e3f2fd;
            color: #1565c0;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
        }

        /* PerfMon Chart Styles */
        .perfmon-section {
            background: #1a1a2e;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
        }

        .perfmon-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .perfmon-header h4 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: #00ff88;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .perfmon-header h4 i {
            color: #00ff88;
        }

        .perfmon-legend {
            display: flex;
            gap: 16px;
            font-size: 11px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #888;
        }

        .legend-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }

        .legend-item.runview .legend-dot { background: #00bcd4; }
        .legend-item.runquery .legend-dot { background: #e040fb; }
        .legend-item.engine .legend-dot { background: #00ff88; }
        .legend-item.ai .legend-dot { background: #ff9800; }

        .perfmon-chart-container {
            display: flex;
            background: #0d0d1a;
            border: 1px solid #333;
            border-radius: 4px;
            position: relative;
        }

        .perfmon-y-axis {
            width: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-right: 1px solid #333;
        }

        .perfmon-y-axis .axis-label {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .perfmon-chart {
            flex: 1;
            height: 300px;
            position: relative;
            overflow: hidden;
        }

        .perfmon-chart svg {
            width: 100%;
            height: 100%;
        }

        .perfmon-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #333;
        }

        .footer-note {
            font-size: 11px;
            color: #666;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .footer-note i {
            color: #00ff88;
        }

        .footer-stats {
            font-size: 11px;
            color: #00ff88;
            font-family: monospace;
        }

        /* D3 Chart Elements */
        .perfmon-chart :deep(.grid-line) {
            stroke: #333;
            stroke-dasharray: 2,2;
        }

        .perfmon-chart :deep(.axis-line) {
            stroke: #555;
        }

        .perfmon-chart :deep(.axis-text) {
            fill: #888;
            font-size: 10px;
            font-family: monospace;
        }

        .perfmon-chart :deep(.event-point) {
            cursor: pointer;
            transition: r 0.15s ease;
        }

        .perfmon-chart :deep(.event-point:hover) {
            r: 6;
        }

        .perfmon-chart :deep(.tooltip) {
            pointer-events: none;
        }

        .perfmon-chart :deep(.tooltip-bg) {
            fill: rgba(0, 0, 0, 0.9);
            rx: 4;
        }

        .perfmon-chart :deep(.tooltip-text) {
            fill: #fff;
            font-size: 11px;
            font-family: monospace;
        }

        .perfmon-chart :deep(.area-fill) {
            opacity: 0.15;
        }

        .perfmon-chart :deep(.line-path) {
            fill: none;
            stroke-width: 1.5;
            opacity: 0.8;
        }

        /* PerfMon Chart Controls */
        .perfmon-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            border: 1px solid #333;
        }

        .chart-control-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            padding: 0;
            background: #2a2a2a;
            color: #888;
            border: 1px solid #444;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .chart-control-btn:hover {
            background: #333;
            color: #00ff88;
            border-color: #00ff88;
        }

        .chart-control-btn:active {
            transform: scale(0.95);
        }

        .chart-control-btn i {
            font-size: 14px;
        }

        /* Mode Toggle Buttons */
        .mode-toggle {
            display: flex;
            background: #1a1a1a;
            border-radius: 4px;
            overflow: hidden;
            border: 1px solid #444;
        }

        .mode-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 28px;
            padding: 0;
            background: transparent;
            color: #666;
            border: none;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .mode-btn:first-child {
            border-right: 1px solid #333;
        }

        .mode-btn:hover {
            color: #aaa;
            background: rgba(255, 255, 255, 0.05);
        }

        .mode-btn.active {
            background: #00ff88;
            color: #1a1a1a;
        }

        .mode-btn.active:hover {
            background: #00cc6a;
        }

        .mode-btn i {
            font-size: 12px;
        }

        .control-divider {
            width: 1px;
            height: 24px;
            background: #444;
            margin: 0 4px;
        }

        .compress-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            font-size: 12px;
            color: #888;
            user-select: none;
        }

        .compress-toggle:hover {
            color: #00ff88;
        }

        .compress-toggle input[type="checkbox"] {
            width: 14px;
            height: 14px;
            accent-color: #00ff88;
            cursor: pointer;
        }

        .compress-toggle span {
            white-space: nowrap;
        }

        .zoom-level {
            font-size: 11px;
            color: #666;
            font-family: monospace;
            margin-left: 8px;
        }

        /* Gap indicators in chart */
        .perfmon-chart :deep(.gap-indicator) {
            cursor: pointer;
            transition: opacity 0.15s ease;
        }

        .perfmon-chart :deep(.gap-indicator:hover) {
            opacity: 0.8;
        }

        .perfmon-chart :deep(.gap-text) {
            fill: #666;
            font-size: 10px;
            font-family: monospace;
            pointer-events: none;
        }

        .perfmon-chart :deep(.gap-expand-btn) {
            cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.15s ease;
        }

        .perfmon-chart :deep(.gap-expand-btn:hover) {
            opacity: 1;
        }

        /* Selection brush overlay */
        .perfmon-chart :deep(.selection-overlay) {
            pointer-events: all;
        }

        .perfmon-chart :deep(.selection-rect) {
            pointer-events: none;
        }

        /* Zoom info display */
        .zoom-info {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: #888;
            font-family: monospace;
        }

        .zoom-info .zoom-level {
            color: #00ff88;
        }

        .zoom-info .time-range {
            color: #666;
        }

        /* Responsive */
        @media (max-width: 1024px) {
            .main-content {
                flex-direction: column;
            }

            .left-nav {
                width: 100%;
                border-right: none;
                border-bottom: 1px solid #e0e0e0;
                padding: 12px;
            }

            .nav-section {
                display: flex;
                gap: 8px;
                overflow-x: auto;
                padding: 0;
            }

            .nav-section-title {
                display: none;
            }

            .nav-item {
                white-space: nowrap;
                padding: 10px 16px;
            }
        }

        @media (max-width: 768px) {
            .diagnostics-header {
                flex-direction: column;
                align-items: flex-start;
            }

            .header-controls {
                width: 100%;
                flex-wrap: wrap;
            }

            .overview-cards {
                grid-template-columns: repeat(2, 1fr);
            }

            .engine-grid {
                grid-template-columns: 1fr;
            }

            .perfmon-legend {
                flex-wrap: wrap;
                gap: 8px;
            }
        }

        /* Export Button */
        .export-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: #4caf50;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .export-btn:hover:not(:disabled) {
            background: #43a047;
            transform: translateY(-1px);
        }

        .export-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* Event Detail Slide-in Panel */
        .event-detail-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 999;
            animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .event-detail-panel {
            position: fixed;
            top: 0;
            right: 0;
            width: 450px;
            max-width: 90vw;
            height: 100vh;
            background: white;
            box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            animation: slideIn 0.25s ease;
        }

        @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
        }

        .event-detail-panel .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            background: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
        }

        .event-detail-panel .panel-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .event-detail-panel .panel-title h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #333;
        }

        .event-detail-panel .close-btn {
            background: none;
            border: none;
            font-size: 18px;
            color: #666;
            cursor: pointer;
            padding: 8px;
            border-radius: 4px;
            transition: all 0.2s ease;
        }

        .event-detail-panel .close-btn:hover {
            background: #e0e0e0;
            color: #333;
        }

        .event-detail-panel .panel-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        /* Detail Metrics */
        .detail-metrics {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 24px;
        }

        .detail-metrics .metric {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
        }

        .detail-metrics .metric-value {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            font-family: monospace;
        }

        .detail-metrics .metric-value.slow {
            color: #e53935;
        }

        .detail-metrics .metric-label {
            font-size: 11px;
            color: #666;
            margin-top: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* Detail Sections */
        .event-detail-panel .detail-section {
            margin-bottom: 24px;
        }

        .event-detail-panel .detail-section h4 {
            font-size: 13px;
            font-weight: 600;
            color: #333;
            margin: 0 0 12px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .event-detail-panel .detail-section h4 i {
            color: #4caf50;
            font-size: 14px;
        }

        .detail-content {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 12px;
        }

        .detail-row {
            display: flex;
            gap: 12px;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }

        .detail-row:last-child {
            border-bottom: none;
        }

        .detail-key {
            font-size: 12px;
            color: #666;
            font-weight: 500;
            min-width: 80px;
            flex-shrink: 0;
        }

        .detail-val {
            font-size: 12px;
            color: #333;
            word-break: break-all;
        }

        .detail-val.entity-highlight {
            font-weight: 600;
            color: #1565c0;
        }

        .detail-val.filter-val {
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 11px;
            background: rgba(0, 0, 0, 0.05);
            padding: 4px 8px;
            border-radius: 4px;
        }

        /* Params Grid */
        .params-grid {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 12px;
            max-height: 200px;
            overflow-y: auto;
        }

        .param-item {
            display: flex;
            gap: 12px;
            padding: 6px 0;
            border-bottom: 1px solid #eee;
            font-size: 12px;
        }

        .param-item:last-child {
            border-bottom: none;
        }

        .param-name {
            color: #6f42c1;
            font-weight: 500;
            min-width: 100px;
            flex-shrink: 0;
            font-family: monospace;
        }

        .param-val {
            color: #333;
            word-break: break-all;
        }

        /* Pattern Summary */
        .pattern-summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            background: #f8f9fa;
            border-radius: 8px;
            padding: 16px;
        }

        .pattern-stat {
            text-align: center;
        }

        .pattern-stat .stat-val {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            font-family: monospace;
        }

        .pattern-stat .stat-label {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 4px;
        }

        .pattern-warning {
            margin-top: 12px;
            padding: 12px;
            background: #fff8e1;
            border-radius: 6px;
            font-size: 12px;
            color: #e65100;
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }

        .pattern-warning i {
            color: #ff9800;
            margin-top: 2px;
        }

        /* Detail Actions */
        .detail-actions {
            display: flex;
            gap: 12px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
        }

        .action-button {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 10px 16px;
            background: #f0f0f0;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            color: #333;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .action-button:hover {
            background: #e8e8e8;
            border-color: #ccc;
        }

        .action-button i {
            color: #666;
        }

        /* Clickable timeline items */
        .timeline-item.clickable {
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .timeline-item.clickable:hover {
            background: rgba(76, 175, 80, 0.05);
        }

        .timeline-item.clickable:hover .marker-dot {
            transform: scale(1.3);
        }

        /* ========================================
           ENGINE DETAIL PANEL STYLES
           ======================================== */

        .engine-detail-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 999;
            animation: fadeIn 0.2s ease;
        }

        .engine-detail-panel {
            position: fixed;
            top: 0;
            right: 0;
            width: 550px;
            max-width: 95vw;
            height: 100vh;
            background: white;
            box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            animation: slideIn 0.25s ease;
        }

        .engine-detail-panel .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            color: white;
        }

        .engine-detail-panel .panel-title {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
            min-width: 0;
        }

        .engine-detail-panel .panel-title h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: white;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .engine-detail-panel .panel-header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .engine-detail-panel .icon-btn {
            background: rgba(255, 255, 255, 0.15);
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .engine-detail-panel .icon-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.25);
        }

        .engine-detail-panel .icon-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .engine-detail-panel .close-btn {
            background: rgba(255, 255, 255, 0.15);
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            font-size: 18px;
        }

        .engine-detail-panel .close-btn:hover {
            background: rgba(255, 255, 255, 0.25);
        }

        .engine-detail-panel .panel-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        /* Engine Summary */
        .engine-summary-section {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 24px;
        }

        .engine-summary-section .summary-stat {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 12px 16px;
        }

        .engine-summary-section .summary-label {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }

        .engine-summary-section .summary-value {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #ff9800;
        }

        .status-dot.status-loaded {
            background: #4caf50;
        }

        /* Config Items Section */
        .config-items-section h4 {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin: 0 0 16px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .config-items-section h4 i {
            color: #4caf50;
        }

        .config-items-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .config-item {
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
            overflow: hidden;
            transition: all 0.2s ease;
        }

        .config-item.expanded {
            border-color: #4caf50;
            box-shadow: 0 2px 8px rgba(76, 175, 80, 0.1);
        }

        .config-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            cursor: pointer;
            transition: background 0.2s ease;
        }

        .config-item-header:hover {
            background: rgba(0, 0, 0, 0.02);
        }

        .config-item-info {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
            min-width: 0;
        }

        .config-type-chip {
            font-size: 10px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            flex-shrink: 0;
        }

        .config-type-chip.type-entity {
            background: #e3f2fd;
            color: #1565c0;
        }

        .config-type-chip.type-dataset {
            background: #f3e5f5;
            color: #7b1fa2;
        }

        .config-name {
            font-size: 13px;
            font-weight: 500;
            color: #333;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .config-item-stats {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .config-stat {
            font-size: 12px;
            color: #666;
        }

        .expand-icon {
            color: #999;
            transition: transform 0.2s ease;
        }

        .config-item.expanded .expand-icon {
            color: #4caf50;
        }

        .config-item-details {
            padding: 0 16px 16px;
            border-top: 1px solid #e0e0e0;
            background: white;
        }

        .config-detail-row {
            display: flex;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
        }

        .config-detail-row:last-child {
            border-bottom: none;
        }

        .config-detail-row .detail-label {
            font-size: 12px;
            color: #888;
            min-width: 70px;
            flex-shrink: 0;
        }

        .config-detail-row .detail-value {
            font-size: 12px;
            color: #333;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 4px;
            word-break: break-all;
        }

        /* Sample Data Section */
        .sample-data-section {
            margin-top: 16px;
        }

        .sample-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .sample-title {
            font-size: 12px;
            font-weight: 600;
            color: #666;
        }

        .sample-header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .load-more-btn,
        .load-all-btn {
            background: none;
            border: 1px solid #667eea;
            color: #667eea;
            font-size: 11px;
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.2s ease;
        }

        .load-more-btn:hover:not(:disabled),
        .load-all-btn:hover:not(:disabled) {
            background: #667eea;
            color: white;
        }

        .load-more-btn:disabled,
        .load-all-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .all-loaded-badge {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: #4caf50;
            padding: 4px 10px;
            background: rgba(76, 175, 80, 0.1);
            border-radius: 4px;
        }

        .action-col {
            width: 36px;
            min-width: 36px;
            max-width: 36px;
            padding: 4px !important;
            text-align: center;
        }

        .open-record-btn {
            width: 24px;
            height: 24px;
            border: none;
            background: #f0f4f8;
            color: #667eea;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            transition: all 0.2s ease;
        }

        .open-record-btn:hover {
            background: #667eea;
            color: white;
        }

        .sample-data-table-wrapper {
            overflow-x: auto;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
        }

        .sample-data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }

        .sample-data-table th {
            background: #f8f9fa;
            padding: 8px 10px;
            text-align: left;
            font-weight: 600;
            color: #666;
            border-bottom: 1px solid #e0e0e0;
            white-space: nowrap;
        }

        .sample-data-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #f0f0f0;
            color: #333;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .sample-data-table tbody tr:last-child td {
            border-bottom: none;
        }

        .sample-data-table tbody tr:hover {
            background: #f8f9fa;
        }

        /* Small empty state */
        .empty-state.small {
            padding: 30px 20px;
        }

        .empty-state.small i {
            font-size: 32px;
        }

        .empty-state.small p {
            font-size: 14px;
        }

        /* Spinning animation for refresh icon */
        .spinning {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* ========================================
           LOCAL CACHE SECTION STYLES
           ======================================== */

        .cache-summary {
            display: flex;
            gap: 16px;
            margin-bottom: 24px;
            flex-wrap: wrap;
        }

        .cache-type-breakdown {
            margin-bottom: 24px;
        }

        .cache-type-breakdown h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            color: #666;
        }

        .type-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }

        .type-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .type-item:hover {
            border-color: #4caf50;
            box-shadow: 0 2px 8px rgba(76, 175, 80, 0.15);
        }

        .type-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f0f0f0;
            border-radius: 8px;
            font-size: 18px;
            color: #666;
        }

        .type-name {
            flex: 1;
            font-weight: 500;
            color: #333;
        }

        .type-count {
            font-size: 18px;
            font-weight: 600;
            color: #4caf50;
        }

        .type-size {
            font-size: 12px;
            color: #888;
            margin-left: 8px;
        }

        .cache-entries-section {
            margin-top: 24px;
        }

        .cache-entries-section .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .cache-entries-section .section-header h4 {
            margin: 0;
            font-size: 14px;
            color: #666;
        }

        .filter-controls {
            display: flex;
            gap: 8px;
        }

        .cache-entries-table-wrapper {
            overflow-x: auto;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }

        .cache-entries-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .cache-entries-table th {
            padding: 12px 16px;
            text-align: left;
            background: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
            font-weight: 600;
            color: #555;
            white-space: nowrap;
        }

        .cache-entries-table td {
            padding: 10px 16px;
            border-bottom: 1px solid #f0f0f0;
            vertical-align: middle;
        }

        .cache-entries-table tbody tr:hover {
            background: #f8f9fa;
        }

        .cache-entries-table tbody tr:last-child td {
            border-bottom: none;
        }

        .cache-type-chip {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
        }

        .cache-type-chip.type-dataset {
            background: #e3f2fd;
            color: #1976d2;
        }

        .cache-type-chip.type-runview {
            background: #e0f7fa;
            color: #00838f;
        }

        .cache-type-chip.type-runquery {
            background: #f3e5f5;
            color: #7b1fa2;
        }

        .entry-name {
            font-weight: 500;
            color: #333;
        }

        .entry-fingerprint {
            display: block;
            font-size: 10px;
            color: #888;
            margin-top: 2px;
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
        }

        .icon-btn {
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid #ddd;
            border-radius: 4px;
            color: #888;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .icon-btn:hover {
            border-color: #f44336;
            color: #f44336;
            background: #fff5f5;
        }

        .table-footer {
            padding: 12px 16px;
            text-align: center;
            font-size: 12px;
            color: #888;
            background: #f8f9fa;
            border-top: 1px solid #e0e0e0;
        }
    `]
})
export class SystemDiagnosticsComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {
    private destroy$ = new Subject<void>();

    // User settings persistence
    private metadata = new Metadata();
    private userSettingEntity: UserSettingEntity | null = null;
    private saveSettingsTimeout: ReturnType<typeof setTimeout> | null = null;
    private settingsLoaded = false;

    // State
    isLoading = false;
    autoRefresh = false;
    activeSection: 'engines' | 'redundant' | 'performance' | 'cache' = 'engines';
    lastUpdated = new Date();
    isRefreshingEngines = false;
    kpiCardsCollapsed = false;

    // Data
    engineStats: EngineMemoryStats | null = null;
    engines: EngineDiagnosticInfo[] = [];
    redundantLoads: RedundantLoadInfo[] = [];

    // Telemetry data
    telemetrySummary: TelemetrySummary | null = null;
    telemetryPatterns: TelemetryPatternDisplay[] = [];
    telemetryInsights: TelemetryInsightDisplay[] = [];
    telemetryEnabled = false;
    categoriesWithData: { name: string; events: number; avgMs: number }[] = [];

    // Telemetry source toggle (client vs server)
    telemetrySource: 'client' | 'server' = 'client';
    serverTelemetryLoading = false;
    serverTelemetryError: string | null = null;
    serverTelemetryEnabled = false; // Read from server config, not changeable at runtime

    // Timeline data
    telemetryEvents: TelemetryEventDisplay[] = [];
    timelineView: 'insights' | 'timeline' | 'chart' = 'insights';

    // Performance sub-tabs
    perfTab: 'monitor' | 'overview' | 'events' | 'patterns' | 'insights' = 'monitor';

    // D3 Chart reference
    @ViewChild('perfChart', { static: false }) perfChartRef!: ElementRef<HTMLDivElement>;
    private chartInitialized = false;

    // Chart zoom and gap compression state
    chartZoomLevel = 1;
    chartGapCompression = true;
    private chartViewportStart = 0;
    private chartViewportEnd = 0;
    private expandedGaps = new Set<number>(); // Track which gaps are expanded

    // Selection-based zoom state
    private isSelecting = false;
    private selectionStartX = 0;
    private selectionRect: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null;
    private chartXScale: d3.ScaleLinear<number, number> | null = null;
    private chartMarginLeft = 50;
    chartTimeRangeStart: number | null = null;  // Currently visible time range start

    // Chart interaction mode: 'pointer' to click events, 'select' for drag-to-zoom, 'pan' for panning
    chartInteractionMode: 'pointer' | 'select' | 'pan' = 'pointer';

    // Store gap segments for inverse mapping (x -> time)
    private chartGapSegments: Array<{ type: 'events' | 'gap'; startTime: number; endTime: number; gapIndex?: number; displayStart: number; displayEnd: number }> = [];
    chartTimeRangeEnd: number | null = null;    // Currently visible time range end

    // Slow queries
    slowQueries: TelemetryEventDisplay[] = [];
    slowQueryThresholdMs = 500;

    // Patterns sorting
    patternSort: PatternSortConfig = { column: 'count', direction: 'desc' };

    // Search/Filter
    searchQuery = '';
    categoryFilter: TelemetryCategory | 'all' = 'all';

    // Store telemetry boot time for relative time calculations (public for template access)
    telemetryBootTime: number = 0;

    // Event detail panel state
    eventDetailPanel: EventDetailPanelState = {
        isOpen: false,
        event: null,
        relatedPattern: null
    };

    // Local Cache data
    cacheStats: CacheStats | null = null;
    cacheEntries: CacheEntryInfo[] = [];
    cacheTypeFilter: CacheEntryType | 'all' = 'all';
    cacheInitialized = false;
    cacheHitRate = 0;

    // Engine detail panel state
    engineDetailPanel: EngineDetailPanelState = {
        isOpen: false,
        engine: null,
        configItems: [],
        isRefreshing: false
    };
    isRefreshingSingleEngine: string | null = null;

    constructor(
        private cdr: ChangeDetectorRef,
        private ngZone: NgZone,
        private navigationService: NavigationService,
        private route: ActivatedRoute
    ) {
        super();
    }

    async ngOnInit() {
        // Load user preferences first
        await this.loadUserPreferences();

        // Apply query params (override preferences if present)
        this.applyQueryParams();

        // Subscribe to query param changes
        this.route.queryParams
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
                // Only apply if we've already loaded settings
                if (this.settingsLoaded) {
                    this.applyQueryParams();
                }
            });

        this.refreshData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
        // Clear any pending save timeout
        if (this.saveSettingsTimeout) {
            clearTimeout(this.saveSettingsTimeout);
        }
    }

    ngAfterViewInit() {
        // Render the PerfMon chart if we're on the monitor tab
        // Need a small delay to ensure the DOM is fully ready
        if (this.activeSection === 'performance' && this.perfTab === 'monitor') {
            setTimeout(() => this.renderPerfChart(), 100);
        }
    }

    setActiveSection(section: 'engines' | 'redundant' | 'performance' | 'cache'): void {
        this.activeSection = section;
        if (section === 'cache') {
            this.refreshCacheData();
        }
        if (section === 'performance' && this.perfTab === 'monitor') {
            // Need to wait for DOM to render before chart can be drawn
            setTimeout(() => this.renderPerfChart(), 50);
        }
        this.cdr.markForCheck();
        this.saveUserPreferencesDebounced();
    }

    toggleAutoRefresh(): void {
        if (this.autoRefresh) {
            // Start auto-refresh interval
            interval(5000)
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => {
                    if (this.autoRefresh) {
                        this.refreshData();
                    }
                });
        }
        this.saveUserPreferencesDebounced();
    }

    toggleKpiCards(): void {
        this.kpiCardsCollapsed = !this.kpiCardsCollapsed;
        this.cdr.markForCheck();
        this.saveUserPreferencesDebounced();
    }

    async refreshData(): Promise<void> {
        this.isLoading = true;
        this.cdr.markForCheck();

        try {
            // Get engine registry stats
            this.engineStats = BaseEngineRegistry.Instance.GetMemoryStats();

            // Transform to display format
            this.engines = this.engineStats.engineStats.map(engine => ({
                className: engine.className,
                isLoaded: engine.isLoaded,
                registeredAt: engine.registeredAt,
                lastLoadedAt: engine.lastLoadedAt,
                estimatedMemoryBytes: engine.estimatedMemoryBytes,
                itemCount: engine.itemCount,
                memoryDisplay: this.formatBytes(engine.estimatedMemoryBytes)
            }));

            // Get redundantly loaded entities
            const redundantMap = BaseEngineRegistry.Instance.GetRedundantlyLoadedEntities();
            this.redundantLoads = Array.from(redundantMap.entries())
                .map(([entityName, engines]) => ({
                    entityName,
                    engines
                }))
                .sort((a, b) => b.engines.length - a.engines.length);

            // Get telemetry data
            this.refreshTelemetryData();

            this.lastUpdated = new Date();
        } catch (error) {
            console.error('Error refreshing diagnostics data:', error);
        } finally {
            this.isLoading = false;
            this.cdr.markForCheck();
        }
    }

    private refreshTelemetryData(): void {
        const tm = TelemetryManager.Instance;
        this.telemetryEnabled = tm.IsEnabled;

        // Get summary stats
        const stats = tm.GetStats();
        this.telemetrySummary = {
            totalEvents: stats.totalEvents,
            totalPatterns: stats.totalPatterns,
            totalInsights: stats.totalInsights,
            activeEvents: stats.activeEvents,
            byCategory: stats.byCategory
        };

        // Build categories with data for display
        const categoryNames: TelemetryCategory[] = ['RunView', 'RunQuery', 'Engine', 'AI', 'Cache'];
        this.categoriesWithData = categoryNames
            .filter(cat => stats.byCategory[cat]?.events > 0)
            .map(cat => ({
                name: cat,
                events: stats.byCategory[cat].events,
                avgMs: stats.byCategory[cat].avgMs
            }));

        // Get patterns and apply sorting
        const patterns = tm.GetPatterns({ minCount: 1, sortBy: 'count' });
        this.telemetryPatterns = this.sortPatterns(patterns.slice(0, 100).map(p => ({
            fingerprint: p.fingerprint,
            category: p.category,
            operation: p.operation,
            entityName: this.getEntityName(p.sampleParams),
            filter: this.getFilter(p.sampleParams),
            orderBy: this.getOrderBy(p.sampleParams),
            count: p.count,
            avgElapsedMs: Math.round(p.avgElapsedMs * 100) / 100,
            totalElapsedMs: Math.round(p.totalElapsedMs),
            minElapsedMs: p.minElapsedMs === Infinity ? 0 : Math.round(p.minElapsedMs),
            maxElapsedMs: Math.round(p.maxElapsedMs),
            lastSeen: new Date(p.lastSeen),
            sampleParams: p.sampleParams
        })));

        // Get all events for timeline
        const events = tm.GetEvents({ limit: 200 });
        this.telemetryEvents = events.map(e => this.eventToDisplay(e));

        // Get slow queries (operations above threshold)
        this.slowQueries = this.telemetryEvents
            .filter(e => e.elapsedMs !== undefined && e.elapsedMs >= this.slowQueryThresholdMs)
            .sort((a, b) => (b.elapsedMs || 0) - (a.elapsedMs || 0))
            .slice(0, 20);

        // Get insights and convert to display format with expansion support
        const insights = tm.GetInsights({ limit: 20 });
        this.telemetryInsights = insights.map(insight => ({
            ...insight,
            expanded: false,
            relatedEvents: this.getRelatedEventsForInsight(insight)
        }));
    }

    private eventToDisplay(e: TelemetryEvent): TelemetryEventDisplay {
        return {
            id: e.id,
            category: e.category,
            operation: e.operation,
            entityName: this.getEntityName(e.params),
            filter: this.getFilter(e.params),
            startTime: e.startTime,
            endTime: e.endTime,
            elapsedMs: e.elapsedMs,
            timestamp: new Date(e.startTime),
            params: e.params
        };
    }

    private getRelatedEventsForInsight(insight: TelemetryInsight): TelemetryEventDisplay[] {
        const tm = TelemetryManager.Instance;
        const events = tm.GetEvents({ limit: 500 });
        return events
            .filter(e => insight.relatedEventIds?.includes(e.id))
            .map(e => this.eventToDisplay(e));
    }

    private sortPatterns(patterns: TelemetryPatternDisplay[]): TelemetryPatternDisplay[] {
        return [...patterns].sort((a, b) => {
            let comparison = 0;
            switch (this.patternSort.column) {
                case 'category':
                    comparison = a.category.localeCompare(b.category);
                    break;
                case 'operation':
                    comparison = a.operation.localeCompare(b.operation);
                    break;
                case 'entity':
                    comparison = (a.entityName || '').localeCompare(b.entityName || '');
                    break;
                case 'count':
                    comparison = a.count - b.count;
                    break;
                case 'avgMs':
                    comparison = a.avgElapsedMs - b.avgElapsedMs;
                    break;
                case 'totalMs':
                    comparison = a.totalElapsedMs - b.totalElapsedMs;
                    break;
            }
            return this.patternSort.direction === 'asc' ? comparison : -comparison;
        });
    }

    sortPatternsBy(column: PatternSortConfig['column']): void {
        if (this.patternSort.column === column) {
            // Toggle direction
            this.patternSort.direction = this.patternSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.patternSort.column = column;
            this.patternSort.direction = 'desc';
        }
        this.telemetryPatterns = this.sortPatterns(this.telemetryPatterns);
        this.cdr.markForCheck();
    }

    getSortIcon(column: PatternSortConfig['column']): string {
        if (this.patternSort.column !== column) {
            return 'fa-sort';
        }
        return this.patternSort.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
    }

    toggleInsightExpanded(insight: TelemetryInsightDisplay): void {
        insight.expanded = !insight.expanded;
        this.cdr.markForCheck();
    }

    setTimelineView(view: 'insights' | 'timeline' | 'chart'): void {
        this.timelineView = view;
        if (view === 'chart') {
            // Render chart after view updates
            setTimeout(() => this.renderPerfChart(), 0);
        }
        this.cdr.markForCheck();
    }

    setPerfTab(tab: 'monitor' | 'overview' | 'events' | 'patterns' | 'insights'): void {
        this.perfTab = tab;
        if (tab === 'monitor') {
            // Render chart after view updates
            setTimeout(() => this.renderPerfChart(), 0);
        }
        this.cdr.markForCheck();
        this.saveUserPreferencesDebounced();
    }

    jumpToPatternsByCategory(categoryName: string): void {
        this.perfTab = 'patterns';
        this.categoryFilter = categoryName as TelemetryCategory;
        this.cdr.markForCheck();
    }

    getInsightFilter(insight: TelemetryInsightDisplay): string | null {
        // Get filter from first related event
        if (insight.relatedEvents.length > 0) {
            return insight.relatedEvents[0].filter;
        }
        return null;
    }

    getEventParams(event: TelemetryEventDisplay): Array<{ key: string; value: string }> {
        const params: Array<{ key: string; value: string }> = [];
        if (!event.params) return params;

        // Cast to record for dynamic iteration - params have been validated by type guards
        const paramsRecord = event.params as unknown as Record<string, unknown>;

        // Show important params first
        const priorityKeys = ['EntityName', 'ViewName', 'ViewID', 'QueryName', 'ExtraFilter', 'OrderBy', 'ResultType', 'MaxRows'];
        const shownKeys = new Set<string>();

        // Add priority keys first if they exist
        for (const key of priorityKeys) {
            if (paramsRecord[key] !== undefined && paramsRecord[key] !== null) {
                const value = this.formatParamValue(paramsRecord[key]);
                if (value) {
                    params.push({ key, value });
                    shownKeys.add(key);
                }
            }
        }

        // Add remaining keys
        for (const [key, val] of Object.entries(paramsRecord)) {
            if (!shownKeys.has(key) && !key.startsWith('_')) {
                const value = this.formatParamValue(val);
                if (value) {
                    params.push({ key, value });
                }
            }
        }

        return params;
    }

    private formatParamValue(val: unknown): string {
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return val || '(empty)';
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'number') return val.toString();
        if (Array.isArray(val)) return val.join(', ');
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    }

    /**
     * Check if this is a RunView/RunViews operation
     */
    isRunViewOperation(event: TelemetryEventDisplay): boolean {
        return event.operation === 'ProviderBase.RunView' || event.operation === 'ProviderBase.RunViews';
    }

    /**
     * Check if this is a batch RunViews operation
     */
    isRunViewsOperation(event: TelemetryEventDisplay): boolean {
        return event.operation === 'ProviderBase.RunViews';
    }

    /**
     * Get entity names for RunViews batch operation (first few for display)
     */
    getRunViewsEntities(event: TelemetryEventDisplay, maxDisplay: number = 3): string[] {
        if (!event.params || !isBatchRunViewParams(event.params)) return [];
        const entities = event.params.Entities;
        if (!entities || !Array.isArray(entities)) return [];
        return entities.slice(0, maxDisplay);
    }

    /**
     * Get total entity count for RunViews batch operation
     */
    getRunViewsEntityCount(event: TelemetryEventDisplay): number {
        if (!event.params || !isBatchRunViewParams(event.params)) return 0;
        return event.params.Entities?.length || 0;
    }

    /**
     * Check if there are more entities than displayed
     */
    hasMoreEntities(event: TelemetryEventDisplay, maxDisplay: number = 3): boolean {
        return this.getRunViewsEntityCount(event) > maxDisplay;
    }

    /**
     * Check if the event was a cache hit (safe accessor for union type params)
     */
    isCacheHit(event: TelemetryEventDisplay | { params: TelemetryParamsUnion }): boolean {
        if (!event?.params) return false;
        // Use isSingleRunViewParams or isSingleRunQueryParams to safely access cacheHit
        if (isSingleRunViewParams(event.params)) {
            return event.params.cacheHit === true;
        }
        if (isSingleRunQueryParams(event.params)) {
            return event.params.cacheHit === true;
        }
        // Handle batch RunViews operations - check cacheHits/cacheMisses counts
        if (isBatchRunViewParams(event.params)) {
            const p = event.params as { cacheHits?: number; cacheMisses?: number };
            // Consider it a cache hit if all items were served from cache
            return (p.cacheHits ?? 0) > 0 && (p.cacheMisses ?? 0) === 0;
        }
        return false;
    }

    /**
     * Get entity name from telemetry params (safe accessor for union type)
     */
    getEntityName(params: TelemetryParamsUnion | undefined): string | null {
        if (!params) return null;
        if (isSingleRunViewParams(params)) {
            return params.EntityName || null;
        }
        if (isSingleRunQueryParams(params)) {
            return params.QueryName || null;
        }
        return null;
    }

    /**
     * Get filter from telemetry params (safe accessor for union type)
     */
    getFilter(params: TelemetryParamsUnion | undefined): string | null {
        if (!params) return null;
        if (isSingleRunViewParams(params)) {
            return params.ExtraFilter || null;
        }
        return null;
    }

    /**
     * Get order by from telemetry params (safe accessor for union type)
     */
    getOrderBy(params: TelemetryParamsUnion | undefined): string | null {
        if (!params) return null;
        if (isSingleRunViewParams(params)) {
            return params.OrderBy || null;
        }
        return null;
    }

    /**
     * Get RunView parameter pills for display
     */
    getRunViewPills(event: TelemetryEventDisplay): Array<{ label: string; value: string; type: 'filter' | 'order' | 'result' | 'limit' | 'batch' | 'info' }> {
        const pills: Array<{ label: string; value: string; type: 'filter' | 'order' | 'result' | 'limit' | 'batch' | 'info' }> = [];

        // For batch operations, show batch size
        if (this.isRunViewsOperation(event) && event.params && isBatchRunViewParams(event.params)) {
            const batchSize = event.params.BatchSize;
            if (batchSize) {
                pills.push({ label: 'Batch', value: String(batchSize), type: 'batch' });
            }
        }

        // For single RunView, show params
        if (!this.isRunViewsOperation(event) && event.params && isSingleRunViewParams(event.params)) {
            const extraFilter = event.params.ExtraFilter;
            if (extraFilter) {
                pills.push({ label: 'Filter', value: this.truncateString(extraFilter, 25), type: 'filter' });
            }

            const orderBy = event.params.OrderBy;
            if (orderBy) {
                pills.push({ label: 'Order', value: this.truncateString(orderBy, 20), type: 'order' });
            }

            const resultType = event.params.ResultType;
            if (resultType && resultType !== 'simple') {
                pills.push({ label: 'Type', value: resultType, type: 'result' });
            }

            const maxRows = event.params.MaxRows;
            if (maxRows && maxRows > 0) {
                pills.push({ label: 'Limit', value: String(maxRows), type: 'limit' });
            }
        }

        return pills;
    }

    // === Event Detail Panel Methods ===

    openEventDetailPanel(event: TelemetryEventDisplay): void {
        // Find related pattern
        const relatedPattern = this.telemetryPatterns.find(p =>
            p.category === event.category &&
            p.operation === event.operation &&
            p.entityName === event.entityName
        ) || null;

        this.eventDetailPanel = {
            isOpen: true,
            event,
            relatedPattern
        };
        this.cdr.markForCheck();
    }

    closeEventDetailPanel(): void {
        this.eventDetailPanel = {
            isOpen: false,
            event: null,
            relatedPattern: null
        };
        this.cdr.markForCheck();
    }

    copyEventToClipboard(event: TelemetryEventDisplay): void {
        const eventData = {
            id: event.id,
            category: event.category,
            operation: event.operation,
            entityName: event.entityName,
            filter: event.filter,
            startTime: event.startTime,
            endTime: event.endTime,
            elapsedMs: event.elapsedMs,
            timestamp: event.timestamp.toISOString(),
            params: event.params
        };

        navigator.clipboard.writeText(JSON.stringify(eventData, null, 2))
            .then(() => {
                // Could show a toast notification here
                console.log('Event copied to clipboard');
            })
            .catch(err => {
                console.error('Failed to copy event:', err);
            });
    }

    filterByEntity(entityName: string | null): void {
        if (!entityName) return;

        this.closeEventDetailPanel();
        this.searchQuery = entityName;
        this.perfTab = 'patterns';
        this.cdr.markForCheck();
    }

    exportTelemetryData(): void {
        const exportData = {
            exportedAt: new Date().toISOString(),
            bootTime: this.telemetryBootTime,
            summary: this.telemetrySummary,
            events: this.telemetryEvents.map(e => ({
                id: e.id,
                category: e.category,
                operation: e.operation,
                entityName: e.entityName,
                filter: e.filter,
                startTime: e.startTime,
                endTime: e.endTime,
                elapsedMs: e.elapsedMs,
                timestamp: e.timestamp.toISOString(),
                params: e.params
            })),
            patterns: this.telemetryPatterns.map(p => ({
                fingerprint: p.fingerprint,
                category: p.category,
                operation: p.operation,
                entityName: p.entityName,
                filter: p.filter,
                count: p.count,
                avgElapsedMs: p.avgElapsedMs,
                totalElapsedMs: p.totalElapsedMs,
                minElapsedMs: p.minElapsedMs,
                maxElapsedMs: p.maxElapsedMs,
                lastSeen: p.lastSeen.toISOString()
            })),
            insights: this.telemetryInsights.map(i => ({
                id: i.id,
                category: i.category,
                severity: i.severity,
                title: i.title,
                message: i.message,
                suggestion: i.suggestion,
                entityName: i.entityName,
                timestamp: typeof i.timestamp === 'number' ? new Date(i.timestamp).toISOString() : i.timestamp
            }))
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `telemetry-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    setCategoryFilter(category: TelemetryCategory | 'all'): void {
        this.categoryFilter = category;
        this.cdr.markForCheck();
        this.saveUserPreferencesDebounced();
    }

    setCategoryFilterByName(name: string): void {
        // Cast string to TelemetryCategory since we know it comes from categoriesWithData
        this.categoryFilter = name as TelemetryCategory;
        this.cdr.markForCheck();
        this.saveUserPreferencesDebounced();
    }

    onSearchChange(): void {
        this.cdr.markForCheck();
        // Debounce URL update for search to avoid too many history changes
        this.updateQueryParamsDebounced();
    }

    clearSearch(): void {
        this.searchQuery = '';
        this.cdr.markForCheck();
        this.updateQueryParams();
    }

    private searchParamsTimeout: ReturnType<typeof setTimeout> | null = null;

    private updateQueryParamsDebounced(): void {
        if (this.searchParamsTimeout) {
            clearTimeout(this.searchParamsTimeout);
        }
        this.searchParamsTimeout = setTimeout(() => {
            this.updateQueryParams();
        }, 300);
    }

    get filteredPatterns(): TelemetryPatternDisplay[] {
        let patterns = this.telemetryPatterns;

        // Apply category filter
        if (this.categoryFilter !== 'all') {
            patterns = patterns.filter(p => p.category === this.categoryFilter);
        }

        // Apply search filter
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase();
            patterns = patterns.filter(p =>
                p.entityName?.toLowerCase().includes(query) ||
                p.operation.toLowerCase().includes(query) ||
                p.filter?.toLowerCase().includes(query) ||
                p.category.toLowerCase().includes(query)
            );
        }

        return patterns;
    }

    get filteredEvents(): TelemetryEventDisplay[] {
        let events = this.telemetryEvents;

        // Apply category filter
        if (this.categoryFilter !== 'all') {
            events = events.filter(e => e.category === this.categoryFilter);
        }

        // Apply search filter
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase();
            events = events.filter(e =>
                e.entityName?.toLowerCase().includes(query) ||
                e.operation.toLowerCase().includes(query) ||
                e.filter?.toLowerCase().includes(query) ||
                e.category.toLowerCase().includes(query)
            );
        }

        return events;
    }

    formatTimestamp(date: Date): string {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    }

    truncateString(str: string | null, maxLength: number): string {
        if (!str) return '-';
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

    toggleTelemetry(): void {
        const tm = TelemetryManager.Instance;
        tm.SetEnabled(!tm.IsEnabled);
        this.telemetryEnabled = tm.IsEnabled;
        this.cdr.markForCheck();
    }

    clearTelemetry(): void {
        // Only client telemetry can be cleared (server telemetry is read-only)
        TelemetryManager.Instance.Clear();
        TelemetryManager.Instance.ClearInsights();
        this.refreshTelemetryData();
        this.cdr.markForCheck();
    }

    /**
     * Switch between client and server telemetry sources
     */
    setTelemetrySource(source: 'client' | 'server'): void {
        if (this.telemetrySource === source) return;

        this.telemetrySource = source;
        this.serverTelemetryError = null;

        if (source === 'server') {
            this.loadServerTelemetry();
        } else {
            this.refreshTelemetryData();
        }
        this.cdr.markForCheck();
        this.saveUserPreferencesDebounced();
    }

    /**
     * Load telemetry data from the server via GraphQL
     */
    private async loadServerTelemetry(): Promise<void> {
        this.serverTelemetryLoading = true;
        this.serverTelemetryError = null;
        this.cdr.markForCheck();

        try {
            const gqlProvider = GraphQLDataProvider.Instance;

            // Query for server telemetry settings (read-only, configured via mj.config.cjs)
            const settingsQuery = `
                query GetServerTelemetrySettings {
                    GetServerTelemetrySettings {
                        enabled
                        level
                    }
                }
            `;

            // Query for server telemetry stats
            const statsQuery = `
                query GetServerTelemetryStats {
                    GetServerTelemetryStats {
                        totalEvents
                        totalPatterns
                        totalInsights
                        activeEvents
                        byCategory {
                            category
                            events
                            avgMs
                        }
                    }
                }
            `;

            // Query for server telemetry events
            const eventsQuery = `
                query GetServerTelemetryEvents($filter: TelemetryEventFilterInput) {
                    GetServerTelemetryEvents(filter: $filter) {
                        id
                        category
                        operation
                        fingerprint
                        startTime
                        endTime
                        elapsedMs
                        userId
                        params
                        tags
                        parentEventId
                    }
                }
            `;

            // Query for server telemetry patterns
            const patternsQuery = `
                query GetServerTelemetryPatterns($filter: TelemetryPatternFilterInput) {
                    GetServerTelemetryPatterns(filter: $filter) {
                        fingerprint
                        category
                        operation
                        sampleParams
                        count
                        totalElapsedMs
                        avgElapsedMs
                        minElapsedMs
                        maxElapsedMs
                        firstSeen
                        lastSeen
                    }
                }
            `;

            // Query for server telemetry insights
            const insightsQuery = `
                query GetServerTelemetryInsights($filter: TelemetryInsightFilterInput) {
                    GetServerTelemetryInsights(filter: $filter) {
                        id
                        severity
                        analyzerName
                        category
                        title
                        message
                        suggestion
                        relatedEventIds
                        entityName
                        metadata
                        timestamp
                    }
                }
            `;

            // Execute queries in parallel
            const [settingsResult, statsResult, eventsResult, patternsResult, insightsResult] = await Promise.all([
                gqlProvider.ExecuteGQL(settingsQuery, {}),
                gqlProvider.ExecuteGQL(statsQuery, {}),
                gqlProvider.ExecuteGQL(eventsQuery, { filter: { limit: 200 } }),
                gqlProvider.ExecuteGQL(patternsQuery, { filter: { minCount: 1 } }),
                gqlProvider.ExecuteGQL(insightsQuery, { filter: { limit: 20 } })
            ]);

            // Process settings (read-only status from server config)
            if (settingsResult?.GetServerTelemetrySettings) {
                this.serverTelemetryEnabled = settingsResult.GetServerTelemetrySettings.enabled;
            }

            // Process stats
            if (statsResult?.GetServerTelemetryStats) {
                const stats = statsResult.GetServerTelemetryStats;
                const byCategory: Record<TelemetryCategory, { events: number; avgMs: number }> = {
                    'RunView': { events: 0, avgMs: 0 },
                    'RunQuery': { events: 0, avgMs: 0 },
                    'Engine': { events: 0, avgMs: 0 },
                    'AI': { events: 0, avgMs: 0 },
                    'Cache': { events: 0, avgMs: 0 },
                    'Network': { events: 0, avgMs: 0 },
                    'Custom': { events: 0, avgMs: 0 }
                };

                for (const cat of stats.byCategory || []) {
                    if (cat.category in byCategory) {
                        byCategory[cat.category as TelemetryCategory] = {
                            events: cat.events,
                            avgMs: cat.avgMs
                        };
                    }
                }

                this.telemetrySummary = {
                    totalEvents: stats.totalEvents,
                    totalPatterns: stats.totalPatterns,
                    totalInsights: stats.totalInsights,
                    activeEvents: stats.activeEvents,
                    byCategory
                };

                // Build categories with data
                const categoryNames: TelemetryCategory[] = ['RunView', 'RunQuery', 'Engine', 'AI', 'Cache'];
                this.categoriesWithData = categoryNames
                    .filter(cat => byCategory[cat]?.events > 0)
                    .map(cat => ({
                        name: cat,
                        events: byCategory[cat].events,
                        avgMs: byCategory[cat].avgMs
                    }));
            }

            // Process events
            if (eventsResult?.GetServerTelemetryEvents) {
                this.telemetryEvents = eventsResult.GetServerTelemetryEvents.map((e: {
                    id: string;
                    category: string;
                    operation: string;
                    startTime: number;
                    endTime?: number;
                    elapsedMs?: number;
                    params: string;
                }) => {
                    const params = e.params ? JSON.parse(e.params) : {};
                    return {
                        id: e.id,
                        category: e.category as TelemetryCategory,
                        operation: e.operation,
                        entityName: params?.EntityName || params?.QueryName || null,
                        filter: params?.ExtraFilter || null,
                        startTime: e.startTime,
                        endTime: e.endTime,
                        elapsedMs: e.elapsedMs,
                        timestamp: new Date(e.startTime),
                        params
                    };
                });

                // Update slow queries
                this.slowQueries = this.telemetryEvents
                    .filter(e => e.elapsedMs !== undefined && e.elapsedMs >= this.slowQueryThresholdMs)
                    .sort((a, b) => (b.elapsedMs || 0) - (a.elapsedMs || 0))
                    .slice(0, 20);
            }

            // Process patterns
            if (patternsResult?.GetServerTelemetryPatterns) {
                this.telemetryPatterns = patternsResult.GetServerTelemetryPatterns.slice(0, 100).map((p: {
                    fingerprint: string;
                    category: string;
                    operation: string;
                    sampleParams: string;
                    count: number;
                    avgElapsedMs: number;
                    totalElapsedMs: number;
                    minElapsedMs: number;
                    maxElapsedMs: number;
                    lastSeen: number;
                }) => {
                    const sampleParams = p.sampleParams ? JSON.parse(p.sampleParams) : {};
                    return {
                        fingerprint: p.fingerprint,
                        category: p.category as TelemetryCategory,
                        operation: p.operation,
                        entityName: sampleParams?.EntityName || sampleParams?.QueryName || null,
                        filter: sampleParams?.ExtraFilter || null,
                        orderBy: sampleParams?.OrderBy || null,
                        count: p.count,
                        avgElapsedMs: Math.round(p.avgElapsedMs * 100) / 100,
                        totalElapsedMs: Math.round(p.totalElapsedMs),
                        minElapsedMs: Math.round(p.minElapsedMs),
                        maxElapsedMs: Math.round(p.maxElapsedMs),
                        lastSeen: new Date(p.lastSeen),
                        sampleParams
                    };
                });
            }

            // Process insights
            if (insightsResult?.GetServerTelemetryInsights) {
                this.telemetryInsights = insightsResult.GetServerTelemetryInsights.map((i: {
                    id: string;
                    severity: string;
                    analyzerName: string;
                    category: string;
                    title: string;
                    message: string;
                    suggestion: string;
                    relatedEventIds: string[];
                    entityName?: string;
                    metadata?: string;
                    timestamp: number;
                }) => ({
                    id: i.id,
                    severity: i.severity,
                    analyzerName: i.analyzerName,
                    category: i.category,
                    title: i.title,
                    message: i.message,
                    suggestion: i.suggestion,
                    relatedEventIds: i.relatedEventIds || [],
                    entityName: i.entityName,
                    metadata: i.metadata ? JSON.parse(i.metadata) : undefined,
                    timestamp: i.timestamp,
                    expanded: false,
                    relatedEvents: []
                }));
            }

            this.telemetryEnabled = true; // Server telemetry is available
        } catch (error) {
            console.error('Failed to load server telemetry:', error);
            this.serverTelemetryError = `Failed to load server telemetry: ${error instanceof Error ? error.message : String(error)}`;
            // Clear data on error
            this.telemetrySummary = null;
            this.telemetryEvents = [];
            this.telemetryPatterns = [];
            this.telemetryInsights = [];
            this.slowQueries = [];
        } finally {
            this.serverTelemetryLoading = false;
            this.cdr.markForCheck();
        }
    }

    getSeverityClass(severity: string): string {
        switch (severity) {
            case 'info': return 'severity-info';
            case 'warning': return 'severity-warning';
            case 'optimization': return 'severity-optimization';
            default: return '';
        }
    }

    getSeverityIcon(severity: string): string {
        switch (severity) {
            case 'info': return 'fa-info-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'optimization': return 'fa-lightbulb';
            default: return 'fa-circle';
        }
    }

    async refreshAllEngines(): Promise<void> {
        this.isRefreshingEngines = true;
        this.cdr.markForCheck();

        try {
            const count = await BaseEngineRegistry.Instance.RefreshAllEngines();
            console.log(`Refreshed ${count} engines`);
            this.refreshData();
        } catch (error) {
            console.error('Error refreshing engines:', error);
        } finally {
            this.isRefreshingEngines = false;
            this.cdr.markForCheck();
        }
    }

    formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTime(date: Date): string {
        return date.toLocaleTimeString();
    }

    formatRelativeTime(ms: number): string {
        if (ms < 1000) {
            return `${ms.toFixed(0)}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const mins = Math.floor(ms / 60000);
            const secs = ((ms % 60000) / 1000).toFixed(0);
            return `${mins}m ${secs}s`;
        }
    }

    /**
     * Renders a Windows PerfMon-style D3 time series chart
     * Shows performance events over time with duration spikes
     */
    renderPerfChart(): void {
        if (!this.perfChartRef?.nativeElement) {
            return;
        }

        const container = this.perfChartRef.nativeElement;
        const events = this.telemetryEvents.filter(e => e.elapsedMs !== undefined);

        if (events.length === 0) {
            container.innerHTML = '<div style="color: #666; text-align: center; padding: 100px 20px;">No telemetry events with timing data yet.<br>Navigate around the app to generate performance data.</div>';
            return;
        }

        // Clear previous chart
        container.innerHTML = '';

        // Get dimensions
        const rect = container.getBoundingClientRect();
        const width = rect.width || 800;
        const height = rect.height || 300;
        const margin = { top: 20, right: 30, bottom: 40, left: 50 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Calculate boot time (earliest event)
        this.telemetryBootTime = Math.min(...events.map(e => e.startTime));

        // Prepare data with relative time
        const allChartData = events.map(e => ({
            ...e,
            relativeTime: e.startTime - this.telemetryBootTime,
            duration: e.elapsedMs || 0
        })).sort((a, b) => a.relativeTime - b.relativeTime);

        // Calculate full time range
        const fullTimeRange = d3.max(allChartData, d => d.relativeTime) || 1000;

        // Determine viewport bounds
        let viewportStart = this.chartViewportStart;
        let viewportEnd = this.chartViewportEnd;

        // If no viewport set or zoom level is 1, show everything
        if (this.chartZoomLevel <= 1 || (viewportStart === 0 && viewportEnd === 0)) {
            viewportStart = 0;
            viewportEnd = fullTimeRange;
        }

        // Filter data to only include events within the viewport (with some padding for edge visibility)
        const padding = (viewportEnd - viewportStart) * 0.05; // 5% padding
        const chartData = allChartData.filter(d =>
            d.relativeTime >= (viewportStart - padding) &&
            d.relativeTime <= (viewportEnd + padding)
        );

        // If no data in viewport, show a message
        if (chartData.length === 0) {
            container.innerHTML = '<div style="color: #666; text-align: center; padding: 100px 20px;">No events in the current view.<br>Try zooming out or panning to see events.</div>';
            return;
        }

        // Calculate effective width with zoom
        const effectiveWidth = innerWidth * this.chartZoomLevel;

        // Create SVG with potential scroll for zoomed view
        const svg = d3.select(container)
            .append('svg')
            .attr('width', Math.max(width, effectiveWidth + margin.left + margin.right))
            .attr('height', height);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Handle gap compression
        let xScale: d3.ScaleLinear<number, number>;
        let gapSegments: Array<{ type: 'events' | 'gap'; startTime: number; endTime: number; gapIndex?: number; displayStart: number; displayEnd: number }> = [];

        if (this.chartGapCompression && chartData.length > 1) {
            // Identify gaps and create compressed scale
            const segments = this.identifyGaps(chartData, 5000); // 5 second threshold
            const compressedGapWidth = 30; // Fixed width for compressed gaps

            // Calculate total display width needed
            let currentX = 0;
            for (const segment of segments) {
                const segmentDuration = segment.endTime - segment.startTime;

                if (segment.type === 'gap') {
                    const isExpanded = segment.gapIndex !== undefined && this.expandedGaps.has(segment.gapIndex);
                    const gapWidth = isExpanded ? (segmentDuration / (d3.max(chartData, d => d.relativeTime) || 1000)) * effectiveWidth : compressedGapWidth;

                    gapSegments.push({
                        ...segment,
                        displayStart: currentX,
                        displayEnd: currentX + gapWidth
                    });
                    currentX += gapWidth;
                } else {
                    // Event segments get proportional width
                    const proportionalWidth = (segmentDuration / (d3.max(chartData, d => d.relativeTime) || 1000)) * effectiveWidth;
                    const segmentWidth = Math.max(proportionalWidth, 50); // Minimum width for visibility

                    gapSegments.push({
                        ...segment,
                        displayStart: currentX,
                        displayEnd: currentX + segmentWidth
                    });
                    currentX += segmentWidth;
                }
            }

            // Create custom scale function based on segments
            const totalDisplayWidth = currentX;
            const baseScale = d3.scaleLinear()
                .domain([0, d3.max(chartData, d => d.relativeTime) || 1000])
                .range([0, Math.min(totalDisplayWidth, effectiveWidth)]);

            // Store gap segments for inverse mapping
            this.chartGapSegments = gapSegments;

            // Create a custom mapping function for segment-based positioning
            const mapTimeToX = (time: number): number => {
                // Find which segment this time falls into
                for (const seg of gapSegments) {
                    if (time >= seg.startTime && time <= seg.endTime) {
                        if (seg.type === 'gap') {
                            const isExpanded = seg.gapIndex !== undefined && this.expandedGaps.has(seg.gapIndex);
                            if (isExpanded) {
                                // Linear interpolation within expanded gap
                                const ratio = (time - seg.startTime) / (seg.endTime - seg.startTime);
                                return seg.displayStart + ratio * (seg.displayEnd - seg.displayStart);
                            }
                            // Compressed gap - map to center
                            return seg.displayStart + (seg.displayEnd - seg.displayStart) / 2;
                        } else {
                            // Event segment - linear interpolation
                            const ratio = (time - seg.startTime) / Math.max(seg.endTime - seg.startTime, 1);
                            return seg.displayStart + ratio * (seg.displayEnd - seg.displayStart);
                        }
                    }
                }
                return baseScale(time);
            };

            // Create inverse mapping function for x -> time (used by selection brush)
            const mapXToTime = (x: number): number => {
                // Find which segment this x position falls into
                for (const seg of gapSegments) {
                    if (x >= seg.displayStart && x <= seg.displayEnd) {
                        if (seg.type === 'gap') {
                            const isExpanded = seg.gapIndex !== undefined && this.expandedGaps.has(seg.gapIndex);
                            if (isExpanded) {
                                // Linear interpolation within expanded gap
                                const displayRange = seg.displayEnd - seg.displayStart;
                                if (displayRange <= 0) return seg.startTime;
                                const ratio = (x - seg.displayStart) / displayRange;
                                return seg.startTime + ratio * (seg.endTime - seg.startTime);
                            }
                            // Compressed gap - return start time (the gap itself has no meaningful selection)
                            return seg.startTime;
                        } else {
                            // Event segment - linear interpolation
                            const displayRange = seg.displayEnd - seg.displayStart;
                            if (displayRange <= 0) return seg.startTime;
                            const ratio = (x - seg.displayStart) / displayRange;
                            return seg.startTime + ratio * (seg.endTime - seg.startTime);
                        }
                    }
                }
                return baseScale.invert(x);
            };

            // Use base scale but override the call behavior via a proxy-like wrapper
            xScale = Object.assign(
                (time: number) => mapTimeToX(time),
                {
                    domain: baseScale.domain.bind(baseScale),
                    range: () => [0, Math.min(totalDisplayWidth, effectiveWidth)] as [number, number],
                    ticks: baseScale.ticks.bind(baseScale),
                    tickFormat: baseScale.tickFormat.bind(baseScale),
                    nice: baseScale.nice.bind(baseScale),
                    copy: baseScale.copy.bind(baseScale),
                    invert: mapXToTime, // Use our custom inverse function!
                    clamp: baseScale.clamp.bind(baseScale),
                    unknown: baseScale.unknown.bind(baseScale),
                    interpolate: baseScale.interpolate.bind(baseScale),
                    rangeRound: baseScale.rangeRound.bind(baseScale)
                }
            ) as unknown as d3.ScaleLinear<number, number>;

            // Draw gap indicators
            for (const seg of gapSegments) {
                if (seg.type === 'gap' && seg.gapIndex !== undefined) {
                    const isExpanded = this.expandedGaps.has(seg.gapIndex);
                    if (!isExpanded) {
                        this.drawGapIndicator(
                            g,
                            seg.displayStart,
                            seg.displayEnd - seg.displayStart,
                            innerHeight,
                            seg.endTime - seg.startTime,
                            seg.gapIndex
                        );
                    }
                }
            }
        } else {
            // Standard linear scale - clear gap segments
            this.chartGapSegments = [];
            // Use viewport bounds for domain when zoomed
            xScale = d3.scaleLinear()
                .domain([viewportStart, viewportEnd])
                .range([0, innerWidth]); // Use innerWidth, not effectiveWidth for proper fit
        }

        // Calculate Y-scale from VISIBLE data only (not all data)
        const visibleMaxDuration = d3.max(chartData, d => d.duration) || 100;
        const yScale = d3.scaleLinear()
            .domain([0, visibleMaxDuration * 1.1]) // Add 10% padding at top
            .range([innerHeight, 0])
            .nice();

        // Draw grid lines
        this.drawGridLines(g, xScale, yScale, effectiveWidth, innerHeight);

        // Draw axes
        this.drawAxes(g, xScale, yScale, innerHeight);

        // Color mapping for categories
        const categoryColors: Record<string, string> = {
            'RunView': '#00bcd4',
            'RunQuery': '#e040fb',
            'Engine': '#00ff88',
            'AI': '#ff9800',
            'Cache': '#f06292',
            'Network': '#26a69a',
            'Custom': '#78909c'
        };

        // Draw area fill for each category (like PerfMon background)
        const categories = [...new Set(chartData.map(d => d.category))];
        categories.forEach(category => {
            const categoryData = chartData.filter(d => d.category === category);
            if (categoryData.length > 1) {
                this.drawCategoryArea(g, categoryData, xScale, yScale, innerHeight, categoryColors[category] || '#78909c');
            }
        });

        // Draw event points
        this.drawEventPoints(g, chartData, xScale, yScale, categoryColors, container);

        // Draw threshold line for slow queries
        this.drawThresholdLine(g, yScale, effectiveWidth, this.slowQueryThresholdMs);

        // Add selection brush for drag-to-zoom and pan
        this.addSelectionBrush(svg, g, xScale, innerHeight, margin, allChartData, fullTimeRange);

        // Store scale and dimensions for selection calculations
        this.chartXScale = xScale;
        this.chartMarginLeft = margin.left;

        this.chartInitialized = true;
    }

    private drawGridLines(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        xScale: d3.ScaleLinear<number, number>,
        yScale: d3.ScaleLinear<number, number>,
        width: number,
        height: number
    ): void {
        // Horizontal grid lines
        const yTicks = yScale.ticks(5);
        g.selectAll('.grid-line-h')
            .data(yTicks)
            .enter()
            .append('line')
            .attr('class', 'grid-line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', d => yScale(d))
            .attr('y2', d => yScale(d))
            .attr('stroke', '#333')
            .attr('stroke-dasharray', '2,2');

        // Vertical grid lines
        const xTicks = xScale.ticks(10);
        g.selectAll('.grid-line-v')
            .data(xTicks)
            .enter()
            .append('line')
            .attr('class', 'grid-line')
            .attr('x1', d => xScale(d))
            .attr('x2', d => xScale(d))
            .attr('y1', 0)
            .attr('y2', height)
            .attr('stroke', '#333')
            .attr('stroke-dasharray', '2,2');
    }

    private drawAxes(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        xScale: d3.ScaleLinear<number, number>,
        yScale: d3.ScaleLinear<number, number>,
        height: number
    ): void {
        // X axis with better time formatting
        const xDomain = xScale.domain();
        const timeRange = xDomain[1] - xDomain[0];

        // Choose appropriate number of ticks based on range
        const numTicks = Math.min(10, Math.max(5, Math.floor(timeRange / 1000)));

        const xAxis = d3.axisBottom(xScale)
            .ticks(numTicks)
            .tickFormat(d => this.formatAxisTime(d as number));

        const xAxisGroup = g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(xAxis)
            .attr('class', 'axis-line');

        xAxisGroup.selectAll('text')
            .attr('class', 'axis-text')
            .attr('fill', '#888')
            .attr('font-size', '11px');

        // X axis label
        xAxisGroup.append('text')
            .attr('class', 'axis-label')
            .attr('x', xScale.range()[1] / 2)
            .attr('y', 35)
            .attr('fill', '#666')
            .attr('font-size', '11px')
            .attr('text-anchor', 'middle')
            .text('Time since process start');

        // Y axis with proper duration formatting
        const yMax = yScale.domain()[1];
        const yAxis = d3.axisLeft(yScale)
            .ticks(6)
            .tickFormat(d => this.formatAxisDuration(d as number, yMax));

        const yAxisGroup = g.append('g')
            .call(yAxis)
            .attr('class', 'axis-line');

        yAxisGroup.selectAll('text')
            .attr('class', 'axis-text')
            .attr('fill', '#888')
            .attr('font-size', '11px');

        // Y axis label
        yAxisGroup.append('text')
            .attr('class', 'axis-label')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', -40)
            .attr('fill', '#666')
            .attr('font-size', '11px')
            .attr('text-anchor', 'middle')
            .text('Duration');
    }

    /**
     * Format time for axis labels - shows relative time since process start
     */
    private formatAxisTime(ms: number): string {
        if (ms < 1000) {
            return `${Math.round(ms)}ms`;
        } else if (ms < 60000) {
            const secs = ms / 1000;
            return secs % 1 === 0 ? `${secs}s` : `${secs.toFixed(1)}s`;
        } else if (ms < 3600000) {
            const mins = Math.floor(ms / 60000);
            const secs = Math.floor((ms % 60000) / 1000);
            return secs > 0 ? `${mins}m${secs}s` : `${mins}m`;
        } else {
            const hours = Math.floor(ms / 3600000);
            const mins = Math.floor((ms % 3600000) / 60000);
            return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
        }
    }

    /**
     * Format duration for Y axis labels
     */
    private formatAxisDuration(ms: number, maxValue: number): string {
        // If max is >= 1000ms, show in seconds for values >= 1000
        if (maxValue >= 1000 && ms >= 1000) {
            return `${(ms / 1000).toFixed(1)}s`;
        }
        return `${Math.round(ms)}ms`;
    }

    private drawCategoryArea(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: Array<{ relativeTime: number; duration: number }>,
        xScale: d3.ScaleLinear<number, number>,
        yScale: d3.ScaleLinear<number, number>,
        height: number,
        color: string
    ): void {
        const area = d3.area<{ relativeTime: number; duration: number }>()
            .x(d => xScale(d.relativeTime))
            .y0(height)
            .y1(d => yScale(d.duration))
            .curve(d3.curveMonotoneX);

        g.append('path')
            .datum(data)
            .attr('class', 'area-fill')
            .attr('d', area)
            .attr('fill', color)
            .attr('opacity', 0.1);

        // Line on top
        const line = d3.line<{ relativeTime: number; duration: number }>()
            .x(d => xScale(d.relativeTime))
            .y(d => yScale(d.duration))
            .curve(d3.curveMonotoneX);

        g.append('path')
            .datum(data)
            .attr('class', 'line-path')
            .attr('d', line)
            .attr('stroke', color)
            .attr('fill', 'none')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.6);
    }

    private drawEventPoints(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: Array<TelemetryEventDisplay & { relativeTime: number; duration: number }>,
        xScale: d3.ScaleLinear<number, number>,
        yScale: d3.ScaleLinear<number, number>,
        categoryColors: Record<string, string>,
        container: HTMLDivElement
    ): void {
        // Create tooltip
        const tooltip = g.append('g')
            .attr('class', 'tooltip')
            .style('display', 'none');

        tooltip.append('rect')
            .attr('class', 'tooltip-bg')
            .attr('fill', 'rgba(0, 0, 0, 0.9)')
            .attr('rx', 4);

        const tooltipText = tooltip.append('text')
            .attr('class', 'tooltip-text')
            .attr('fill', '#fff')
            .attr('font-size', '11px')
            .attr('font-family', 'monospace');

        // Split data into cached and non-cached events
        const nonCachedData = data.filter(d => !this.isCacheHit(d));
        const cachedData = data.filter(d => this.isCacheHit(d));

        // Helper to show tooltip
        const showTooltip = (event: MouseEvent, d: TelemetryEventDisplay & { relativeTime: number; duration: number }) => {
            // Update tooltip content
            const isCached = this.isCacheHit(d);
            const lines = [
                `${d.category}: ${d.operation}`,
                d.entityName ? `Entity: ${d.entityName}` : null,
                `Duration: ${d.duration.toFixed(0)}ms`,
                isCached ? '⚡ CACHED' : null,
                `Time: +${this.formatRelativeTime(d.relativeTime)}`
            ].filter(Boolean);

            tooltipText.selectAll('tspan').remove();
            lines.forEach((line, i) => {
                tooltipText.append('tspan')
                    .attr('x', 8)
                    .attr('dy', i === 0 ? '1.2em' : '1.4em')
                    .text(line as string);
            });

            // Size tooltip background
            const textBBox = (tooltipText.node() as SVGTextElement).getBBox();
            tooltip.select('.tooltip-bg')
                .attr('width', textBBox.width + 16)
                .attr('height', textBBox.height + 12)
                .attr('y', textBBox.y - 6);

            // Position tooltip
            const x = xScale(d.relativeTime);
            const y = yScale(d.duration);
            const tooltipWidth = textBBox.width + 16;

            // Flip tooltip if too close to right edge
            const translateX = x + tooltipWidth + 20 > (container.clientWidth - 80) ? x - tooltipWidth - 10 : x + 10;
            tooltip.attr('transform', `translate(${translateX},${y - 20})`);
            tooltip.style('display', 'block');
        };

        const hideTooltip = () => {
            tooltip.style('display', 'none');
        };

        // Draw circles for non-cached events
        g.selectAll('.event-point-circle')
            .data(nonCachedData)
            .enter()
            .append('circle')
            .attr('class', 'event-point event-point-circle')
            .attr('cx', d => xScale(d.relativeTime))
            .attr('cy', d => yScale(d.duration))
            .attr('r', d => d.duration >= this.slowQueryThresholdMs ? 5 : 3)
            .attr('fill', d => categoryColors[d.category] || '#78909c')
            .attr('stroke', d => d.duration >= this.slowQueryThresholdMs ? '#ff5252' : 'none')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('mouseenter', (event: MouseEvent, d) => {
                const target = event.target as SVGCircleElement;
                d3.select(target).attr('r', 7);
                showTooltip(event, d);
            })
            .on('mouseleave', (event: MouseEvent, d) => {
                const target = event.target as SVGCircleElement;
                d3.select(target).attr('r', d.duration >= this.slowQueryThresholdMs ? 5 : 3);
                hideTooltip();
            })
            .on('click', (_event: MouseEvent, d) => {
                // Open detail panel for this event
                this.ngZone.run(() => {
                    this.openEventDetailPanel(d);
                });
            });

        // Draw bolt symbols for cached events
        // SVG path for a lightning bolt shape
        const boltPath = 'M-3,-6 L1,-6 L0,-1 L4,-1 L-2,6 L0,1 L-4,1 Z';

        g.selectAll('.event-point-bolt')
            .data(cachedData)
            .enter()
            .append('path')
            .attr('class', 'event-point event-point-bolt')
            .attr('d', boltPath)
            .attr('transform', d => `translate(${xScale(d.relativeTime)},${yScale(d.duration)}) scale(${d.duration >= this.slowQueryThresholdMs ? 1.3 : 1})`)
            .attr('fill', '#f59e0b')
            .attr('stroke', d => d.duration >= this.slowQueryThresholdMs ? '#ff5252' : categoryColors[d.category] || '#78909c')
            .attr('stroke-width', 1.5)
            .style('cursor', 'pointer')
            .style('filter', 'drop-shadow(0 0 2px rgba(245, 158, 11, 0.5))')
            .on('mouseenter', (event: MouseEvent, d) => {
                const target = event.target as SVGPathElement;
                d3.select(target)
                    .attr('transform', `translate(${xScale(d.relativeTime)},${yScale(d.duration)}) scale(1.5)`)
                    .style('filter', 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.8))');
                showTooltip(event, d);
            })
            .on('mouseleave', (event: MouseEvent, d) => {
                const target = event.target as SVGPathElement;
                d3.select(target)
                    .attr('transform', `translate(${xScale(d.relativeTime)},${yScale(d.duration)}) scale(${d.duration >= this.slowQueryThresholdMs ? 1.3 : 1})`)
                    .style('filter', 'drop-shadow(0 0 2px rgba(245, 158, 11, 0.5))');
                hideTooltip();
            })
            .on('click', (_event: MouseEvent, d) => {
                // Open detail panel for this event
                this.ngZone.run(() => {
                    this.openEventDetailPanel(d);
                });
            });
    }

    private drawThresholdLine(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        yScale: d3.ScaleLinear<number, number>,
        width: number,
        threshold: number
    ): void {
        const yPos = yScale(threshold);

        // Only draw if threshold is within visible range
        if (yPos > 0 && yPos < yScale.range()[0]) {
            g.append('line')
                .attr('x1', 0)
                .attr('x2', width)
                .attr('y1', yPos)
                .attr('y2', yPos)
                .attr('stroke', '#ff5252')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '5,3')
                .attr('opacity', 0.7);

            g.append('text')
                .attr('x', width - 5)
                .attr('y', yPos - 5)
                .attr('text-anchor', 'end')
                .attr('fill', '#ff5252')
                .attr('font-size', '10px')
                .text(`Slow (>${threshold}ms)`);
        }
    }

    // === Chart Zoom and Gap Compression Methods ===

    /**
     * Zoom the chart in or out
     */
    zoomPerfChart(direction: 'in' | 'out'): void {
        const zoomFactor = 1.5;
        if (direction === 'in') {
            this.chartZoomLevel = Math.min(this.chartZoomLevel * zoomFactor, 100); // Allow up to 100x zoom
        } else {
            this.chartZoomLevel = Math.max(this.chartZoomLevel / zoomFactor, 0.25); // Allow zoom out to 25%
        }
        this.renderPerfChart();
        this.cdr.markForCheck();
        this.saveUserPreferencesDebounced();
    }

    /**
     * Reset chart zoom to default
     */
    resetPerfChartZoom(): void {
        this.chartZoomLevel = 1;
        this.chartViewportStart = 0;
        this.chartViewportEnd = 0;
        this.chartTimeRangeStart = null;
        this.chartTimeRangeEnd = null;
        this.expandedGaps.clear();
        this.renderPerfChart();
        this.cdr.markForCheck();
        this.saveUserPreferencesDebounced();
    }

    /**
     * Handle gap compression toggle
     */
    onGapCompressionChange(): void {
        this.expandedGaps.clear();
        this.renderPerfChart();
        this.cdr.markForCheck();
        this.saveUserPreferencesDebounced();
    }

    /**
     * Set chart interaction mode (select for drag-to-zoom, pan for click-to-view)
     */
    setChartInteractionMode(mode: 'pointer' | 'select' | 'pan'): void {
        this.chartInteractionMode = mode;
        this.renderPerfChart(); // Re-render to update cursor and behavior
        this.cdr.markForCheck();
    }

    /**
     * Returns the appropriate cursor style based on the current chart interaction mode
     */
    private getChartCursor(): string {
        switch (this.chartInteractionMode) {
            case 'pointer':
                return 'default';
            case 'select':
                return 'crosshair';
            case 'pan':
                return 'grab';
            default:
                return 'default';
        }
    }

    /**
     * Returns whether the overlay should intercept pointer events based on the current mode
     */
    private getOverlayPointerEvents(): string {
        // In pointer mode, let events pass through to the data points
        // In select/pan mode, the overlay needs to capture events
        return this.chartInteractionMode === 'pointer' ? 'none' : 'all';
    }

    /**
     * Identifies gaps in the data where there's no activity
     * Returns segments with their type (events or gap)
     */
    private identifyGaps(
        events: Array<{ relativeTime: number; duration: number }>,
        gapThresholdMs: number = 5000
    ): Array<{ type: 'events' | 'gap'; startTime: number; endTime: number; gapIndex?: number; events?: typeof events }> {
        if (events.length === 0) return [];

        const segments: Array<{ type: 'events' | 'gap'; startTime: number; endTime: number; gapIndex?: number; events?: typeof events }> = [];
        let gapIndex = 0;

        // Sort events by time
        const sortedEvents = [...events].sort((a, b) => a.relativeTime - b.relativeTime);

        let currentSegmentStart = sortedEvents[0].relativeTime;
        let currentSegmentEvents: typeof events = [];
        let lastEventTime = sortedEvents[0].relativeTime;

        for (let i = 0; i < sortedEvents.length; i++) {
            const event = sortedEvents[i];
            const timeSinceLastEvent = event.relativeTime - lastEventTime;

            if (timeSinceLastEvent > gapThresholdMs && currentSegmentEvents.length > 0) {
                // Close current event segment
                segments.push({
                    type: 'events',
                    startTime: currentSegmentStart,
                    endTime: lastEventTime,
                    events: currentSegmentEvents
                });

                // Add gap segment
                segments.push({
                    type: 'gap',
                    startTime: lastEventTime,
                    endTime: event.relativeTime,
                    gapIndex: gapIndex++
                });

                // Start new segment
                currentSegmentStart = event.relativeTime;
                currentSegmentEvents = [event];
            } else {
                currentSegmentEvents.push(event);
            }

            lastEventTime = event.relativeTime;
        }

        // Close final segment
        if (currentSegmentEvents.length > 0) {
            segments.push({
                type: 'events',
                startTime: currentSegmentStart,
                endTime: lastEventTime,
                events: currentSegmentEvents
            });
        }

        return segments;
    }

    /**
     * Draws a compressed gap indicator
     */
    private drawGapIndicator(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        x: number,
        width: number,
        height: number,
        gapDurationMs: number,
        gapIndex: number
    ): void {
        const isExpanded = this.expandedGaps.has(gapIndex);

        // Draw striped background
        const pattern = g.append('defs')
            .append('pattern')
            .attr('id', `gap-pattern-${gapIndex}`)
            .attr('patternUnits', 'userSpaceOnUse')
            .attr('width', 8)
            .attr('height', 8)
            .attr('patternTransform', 'rotate(45)');

        pattern.append('rect')
            .attr('width', 8)
            .attr('height', 8)
            .attr('fill', '#f5f5f5');

        pattern.append('line')
            .attr('x1', 0)
            .attr('y1', 0)
            .attr('x2', 0)
            .attr('y2', 8)
            .attr('stroke', '#e0e0e0')
            .attr('stroke-width', 4);

        // Gap rectangle
        const gapRect = g.append('rect')
            .attr('x', x)
            .attr('y', 0)
            .attr('width', width)
            .attr('height', height)
            .attr('fill', `url(#gap-pattern-${gapIndex})`)
            .attr('stroke', '#ccc')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,2')
            .style('cursor', 'pointer');

        // Vertical text showing gap duration
        const gapText = this.formatRelativeTime(gapDurationMs);
        const textG = g.append('g')
            .attr('transform', `translate(${x + width / 2}, ${height / 2})`)
            .style('pointer-events', 'none');

        textG.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('text-anchor', 'middle')
            .attr('fill', '#888')
            .attr('font-size', '10px')
            .attr('font-weight', '500')
            .text(`${gapText} gap`);

        // Click handler to expand/collapse
        gapRect.on('click', () => {
            this.ngZone.run(() => {
                if (this.expandedGaps.has(gapIndex)) {
                    this.expandedGaps.delete(gapIndex);
                } else {
                    this.expandedGaps.add(gapIndex);
                }
                this.renderPerfChart();
            });
        });
    }

    /**
     * Adds a drag-to-select brush overlay for zooming into a time range
     * Only active when chartInteractionMode is 'select'
     */
    private addSelectionBrush(
        svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        xScale: d3.ScaleLinear<number, number>,
        innerHeight: number,
        _margin: { top: number; right: number; bottom: number; left: number },
        allChartData: Array<{ relativeTime: number; duration: number }>,
        fullTimeRange: number
    ): void {
        // Create a transparent overlay for mouse events
        // Cursor and pointer-events depend on interaction mode
        const overlay = g.append('rect')
            .attr('class', 'selection-overlay')
            .attr('width', xScale.range()[1])
            .attr('height', innerHeight)
            .attr('fill', 'transparent')
            .style('cursor', this.getChartCursor())
            .style('pointer-events', this.getOverlayPointerEvents());

        // Selection rectangle (initially hidden) - only used in select mode
        const selectionRect = g.append('rect')
            .attr('class', 'selection-rect')
            .attr('fill', 'rgba(0, 255, 136, 0.15)')
            .attr('stroke', '#00ff88')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,2')
            .style('display', 'none');

        let startX = 0;
        let isDragging = false;
        let isPanning = false;
        let panStartX = 0;
        let panStartViewportStart = 0;

        // Store the inverse scale function for mapping x back to time
        const getTimeFromX = (x: number): number => {
            // For gap-compressed scales, we need to use invert if available
            if (typeof xScale.invert === 'function') {
                return xScale.invert(x);
            }
            // Fallback: linear interpolation
            const domain = xScale.domain();
            const range = xScale.range();
            const ratio = (x - range[0]) / (range[1] - range[0]);
            return domain[0] + ratio * (domain[1] - domain[0]);
        };

        overlay.on('mousedown', (event: MouseEvent) => {
            if (this.chartInteractionMode === 'select') {
                // Selection mode - drag to zoom
                isDragging = true;
                this.isSelecting = true;
                const [x] = d3.pointer(event, overlay.node());
                startX = Math.max(0, Math.min(x, xScale.range()[1]));
                this.selectionStartX = startX;

                selectionRect
                    .attr('x', startX)
                    .attr('y', 0)
                    .attr('width', 0)
                    .attr('height', innerHeight)
                    .style('display', 'block');
            } else if (this.chartInteractionMode === 'pan') {
                // Pan mode - drag to pan
                isPanning = true;
                const [x] = d3.pointer(event, overlay.node());
                panStartX = x;
                panStartViewportStart = this.chartViewportStart;
                overlay.style('cursor', 'grabbing');
            }
        });

        svg.on('mousemove', (event: MouseEvent) => {
            if (isDragging && this.chartInteractionMode === 'select') {
                const [x] = d3.pointer(event, g.node());
                const currentX = Math.max(0, Math.min(x, xScale.range()[1]));

                const rectX = Math.min(startX, currentX);
                const rectWidth = Math.abs(currentX - startX);

                selectionRect
                    .attr('x', rectX)
                    .attr('width', rectWidth);
            } else if (isPanning && this.chartInteractionMode === 'pan') {
                const [x] = d3.pointer(event, g.node());
                const deltaX = x - panStartX;

                // Convert pixel delta to time delta
                const pixelsPerMs = xScale.range()[1] / ((xScale.domain()[1] - xScale.domain()[0]) || 1);
                const timeDelta = -deltaX / pixelsPerMs; // Negative because dragging right should move viewport left

                // Calculate new viewport position using the full time range
                const viewportSize = (this.chartViewportEnd - this.chartViewportStart) || fullTimeRange / this.chartZoomLevel;

                let newStart = panStartViewportStart + timeDelta;
                // Clamp to valid range
                newStart = Math.max(0, Math.min(newStart, fullTimeRange - viewportSize));

                this.chartViewportStart = newStart;
                this.chartViewportEnd = newStart + viewportSize;

                // Re-render chart with new viewport
                this.ngZone.run(() => {
                    this.renderPerfChart();
                });
            }
        });

        svg.on('mouseup', (event: MouseEvent) => {
            if (isDragging && this.chartInteractionMode === 'select') {
                isDragging = false;
                this.isSelecting = false;

                const [x] = d3.pointer(event, g.node());
                const endX = Math.max(0, Math.min(x, xScale.range()[1]));

                selectionRect.style('display', 'none');

                // Only zoom if selection is significant (> 20 pixels)
                const selectionWidth = Math.abs(endX - startX);
                if (selectionWidth > 20) {
                    const startTime = getTimeFromX(Math.min(startX, endX));
                    const endTime = getTimeFromX(Math.max(startX, endX));

                    this.ngZone.run(() => {
                        this.zoomToTimeRange(startTime, endTime, allChartData);
                    });
                }
            } else if (isPanning) {
                isPanning = false;
                overlay.style('cursor', 'grab');
            }
        });

        // Cancel selection/pan on mouse leave
        svg.on('mouseleave', () => {
            if (isDragging) {
                isDragging = false;
                this.isSelecting = false;
                selectionRect.style('display', 'none');
            }
            if (isPanning) {
                isPanning = false;
                overlay.style('cursor', 'grab');
            }
        });
    }

    /**
     * Zooms the chart to show only events within the specified time range
     */
    private zoomToTimeRange(
        startTime: number,
        endTime: number,
        allData: Array<{ relativeTime: number; duration: number }>
    ): void {
        // Store the time range for filtering
        this.chartTimeRangeStart = startTime;
        this.chartTimeRangeEnd = endTime;

        // Calculate zoom level based on selection
        const fullRange = (d3.max(allData, d => d.relativeTime) || 1000) - (d3.min(allData, d => d.relativeTime) || 0);
        const selectedRange = endTime - startTime;
        const newZoomLevel = fullRange / Math.max(selectedRange, 10); // Allow very fine selections (down to 10ms)

        this.chartZoomLevel = Math.min(Math.max(newZoomLevel, 1), 100); // Allow up to 100x zoom
        this.chartViewportStart = startTime;
        this.chartViewportEnd = endTime;

        this.renderPerfChart();
        this.cdr.markForCheck();
    }

    // === Local Cache Methods ===

    /**
     * Refreshes cache data from LocalCacheManager
     */
    refreshCacheData(): void {
        const lcm = LocalCacheManager.Instance;
        this.cacheInitialized = lcm.IsInitialized;

        if (this.cacheInitialized) {
            this.cacheStats = lcm.GetStats();
            this.cacheEntries = lcm.GetAllEntries();
            this.cacheHitRate = lcm.GetHitRate();
        } else {
            this.cacheStats = null;
            this.cacheEntries = [];
            this.cacheHitRate = 0;
        }

        this.cdr.markForCheck();
    }

    /**
     * Getter for filtered cache entries based on type filter
     */
    get filteredCacheEntries(): CacheEntryInfo[] {
        if (this.cacheTypeFilter === 'all') {
            return this.cacheEntries;
        }
        return this.cacheEntries.filter(e => e.type === this.cacheTypeFilter);
    }

    /**
     * Sets the cache type filter
     */
    setCacheTypeFilter(type: CacheEntryType | 'all'): void {
        this.cacheTypeFilter = type;
        this.cdr.markForCheck();
    }

    /**
     * Clears all cache entries
     */
    async clearAllCache(): Promise<void> {
        const lcm = LocalCacheManager.Instance;
        if (lcm.IsInitialized) {
            await lcm.ClearAll();
            this.refreshCacheData();
        }
    }

    /**
     * Invalidates a single cache entry
     */
    async invalidateCacheEntry(entry: CacheEntryInfo): Promise<void> {
        const lcm = LocalCacheManager.Instance;
        if (!lcm.IsInitialized) return;

        // Remove based on type
        if (entry.type === 'runview' && entry.fingerprint) {
            await lcm.InvalidateRunViewResult(entry.fingerprint);
        } else if (entry.type === 'dataset') {
            // For datasets, we need to call ClearDataset with proper params
            // Since we don't have the full params, use the key directly
            // This is a simplified approach - in production you'd want more robust handling
            await lcm.InvalidateRunViewResult(entry.key);
        } else if (entry.type === 'runquery' && entry.fingerprint) {
            await lcm.InvalidateRunViewResult(entry.fingerprint);
        }

        this.refreshCacheData();
    }

    /**
     * Formats a cache timestamp (unix ms) to display string
     */
    formatCacheTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // === Engine Detail Panel Methods ===

    /**
     * Refresh a single engine
     */
    async refreshSingleEngine(engine: EngineDiagnosticInfo, event: Event): Promise<void> {
        event.stopPropagation();
        this.isRefreshingSingleEngine = engine.className;
        this.cdr.markForCheck();

        try {
            const engineInstance = BaseEngineRegistry.Instance.GetEngine<{ RefreshAllItems: () => Promise<void> }>(engine.className);
            if (engineInstance && typeof engineInstance.RefreshAllItems === 'function') {
                await engineInstance.RefreshAllItems();
                console.log(`Refreshed engine: ${engine.className}`);
            }
            this.refreshData();
        } catch (error) {
            console.error(`Error refreshing engine ${engine.className}:`, error);
        } finally {
            this.isRefreshingSingleEngine = null;
            this.cdr.markForCheck();
        }
    }

    /**
     * Opens the engine detail panel for a specific engine
     */
    openEngineDetailPanel(engine: EngineDiagnosticInfo): void {
        const configItems = this.getEngineConfigItems(engine.className);

        this.engineDetailPanel = {
            isOpen: true,
            engine,
            configItems,
            isRefreshing: false
        };
        this.cdr.markForCheck();
    }

    /**
     * Closes the engine detail panel
     */
    closeEngineDetailPanel(): void {
        this.engineDetailPanel = {
            isOpen: false,
            engine: null,
            configItems: [],
            isRefreshing: false
        };
        this.cdr.markForCheck();
    }

    /**
     * Refreshes the engine shown in the detail panel
     */
    async refreshEngineInDetailPanel(): Promise<void> {
        if (!this.engineDetailPanel.engine) return;

        this.engineDetailPanel.isRefreshing = true;
        this.cdr.markForCheck();

        try {
            const engineInstance = BaseEngineRegistry.Instance.GetEngine<{ RefreshAllItems: () => Promise<void> }>(
                this.engineDetailPanel.engine.className
            );
            if (engineInstance && typeof engineInstance.RefreshAllItems === 'function') {
                await engineInstance.RefreshAllItems();
            }

            // Refresh the data and reopen panel with updated info
            await this.refreshData();

            // Update the panel with refreshed data
            const updatedEngine = this.engines.find(e => e.className === this.engineDetailPanel.engine?.className);
            if (updatedEngine) {
                this.engineDetailPanel.engine = updatedEngine;
                this.engineDetailPanel.configItems = this.getEngineConfigItems(updatedEngine.className);
            }
        } catch (error) {
            console.error('Error refreshing engine in detail panel:', error);
        } finally {
            this.engineDetailPanel.isRefreshing = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Gets config items for an engine by examining its Configs property
     */
    private getEngineConfigItems(className: string): EngineConfigItemDisplay[] {
        const engineInstance = BaseEngineRegistry.Instance.GetEngine<{
            Configs?: Array<{
                Type: 'entity' | 'dataset';
                PropertyName: string;
                EntityName?: string;
                DatasetName?: string;
                Filter?: string;
                OrderBy?: string;
            }>;
        }>(className);

        if (!engineInstance || !engineInstance.Configs) {
            return [];
        }

        const engineObj = engineInstance as Record<string, unknown>;
        const items: EngineConfigItemDisplay[] = [];

        for (const config of engineInstance.Configs) {
            const propValue = engineObj[config.PropertyName];
            const dataArray = Array.isArray(propValue) ? propValue : [];
            const estimatedBytes = this.estimateArrayMemory(dataArray);
            const initialPageSize = 10;
            const initialData = dataArray.slice(0, initialPageSize);

            items.push({
                propertyName: config.PropertyName,
                type: config.Type || 'entity',
                entityName: config.EntityName,
                datasetName: config.DatasetName,
                filter: config.Filter,
                orderBy: config.OrderBy,
                itemCount: dataArray.length,
                estimatedMemoryBytes: estimatedBytes,
                memoryDisplay: this.formatBytes(estimatedBytes),
                sampleData: dataArray, // Store all data for paging
                expanded: false,
                // Paging support
                displayedData: initialData,
                allDataLoaded: dataArray.length <= initialPageSize,
                isLoadingMore: false,
                currentPage: 1,
                pageSize: initialPageSize
            });
        }

        return items.sort((a, b) => b.itemCount - a.itemCount);
    }

    /**
     * Estimates memory for an array of objects
     */
    private estimateArrayMemory(arr: unknown[]): number {
        if (arr.length === 0) return 0;

        // Sample first item to estimate size
        const sample = arr[0];
        let bytesPerItem = 100; // default

        if (sample && typeof sample === 'object') {
            try {
                // For MJ entity objects, use GetAll() to get just the data values
                // This avoids serializing the massive metadata/prototype chain
                const sampleObj = sample as { GetAll?: () => Record<string, unknown> };
                const dataToSerialize = sampleObj.GetAll ? sampleObj.GetAll() : sample;
                const json = JSON.stringify(dataToSerialize);
                bytesPerItem = json.length * 2; // UTF-16
            } catch {
                bytesPerItem = 500;
            }
        }

        return arr.length * bytesPerItem;
    }

    /**
     * Toggle expansion of a config item
     */
    toggleConfigItemExpanded(item: EngineConfigItemDisplay): void {
        item.expanded = !item.expanded;
        this.cdr.markForCheck();
    }

    /**
     * Get column names for sample data display
     */
    getSampleDataColumns(item: EngineConfigItemDisplay): string[] {
        if (item.sampleData.length === 0) return [];

        const sample = item.sampleData[0];
        if (!sample || typeof sample !== 'object') return [];

        // For BaseEntity objects, try to get key properties
        const obj = sample as Record<string, unknown>;

        // Check if it's a BaseEntity with GetAll method
        if ('GetAll' in obj && typeof obj.GetAll === 'function') {
            const allData = (obj as { GetAll: () => Record<string, unknown> }).GetAll();
            // Return priority columns first
            const priorityKeys = ['ID', 'Name', 'Description', 'Code', 'Status', 'Type'];
            const availableKeys = Object.keys(allData);
            const result: string[] = [];

            for (const key of priorityKeys) {
                if (availableKeys.includes(key)) {
                    result.push(key);
                }
            }

            // Add remaining keys up to 6 total
            for (const key of availableKeys) {
                if (!result.includes(key) && result.length < 6 && !key.startsWith('_')) {
                    result.push(key);
                }
            }

            return result;
        }

        // For plain objects
        const keys = Object.keys(obj).filter(k => !k.startsWith('_'));
        return keys.slice(0, 6);
    }

    /**
     * Get a value from sample data for display
     */
    getSampleDataValue(row: unknown, column: string): string {
        if (!row || typeof row !== 'object') return '';

        const obj = row as Record<string, unknown>;

        // For BaseEntity objects, use GetAll
        if ('GetAll' in obj && typeof obj.GetAll === 'function') {
            const allData = (obj as { GetAll: () => Record<string, unknown> }).GetAll();
            const value = allData[column];
            return this.formatValueForDisplay(value);
        }

        // For plain objects
        const value = obj[column];
        return this.formatValueForDisplay(value);
    }

    /**
     * Format a value for display in sample data table
     */
    private formatValueForDisplay(value: unknown): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (value instanceof Date) return value.toLocaleDateString();
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    /**
     * Load more data for a config item (paging)
     */
    loadMoreData(item: EngineConfigItemDisplay): void {
        if (item.isLoadingMore || item.allDataLoaded) return;

        item.isLoadingMore = true;
        this.cdr.markForCheck();

        // Simulate async loading (data is already in memory)
        setTimeout(() => {
            const nextPage = item.currentPage + 1;
            const startIndex = item.currentPage * item.pageSize;
            const endIndex = startIndex + item.pageSize;
            const newData = item.sampleData.slice(startIndex, endIndex);

            item.displayedData = [...item.displayedData, ...newData];
            item.currentPage = nextPage;
            item.allDataLoaded = item.displayedData.length >= item.sampleData.length;
            item.isLoadingMore = false;
            this.cdr.markForCheck();
        }, 100);
    }

    /**
     * Load all remaining data for a config item
     */
    loadAllData(item: EngineConfigItemDisplay): void {
        if (item.isLoadingMore || item.allDataLoaded) return;

        item.isLoadingMore = true;
        this.cdr.markForCheck();

        // Simulate async loading (data is already in memory)
        setTimeout(() => {
            item.displayedData = [...item.sampleData];
            item.allDataLoaded = true;
            item.isLoadingMore = false;
            this.cdr.markForCheck();
        }, 100);
    }

    /**
     * Get the record ID from a row (for opening entity records)
     */
    getRecordId(row: unknown): string | null {
        if (!row || typeof row !== 'object') return null;

        const obj = row as Record<string, unknown>;

        // For BaseEntity objects, use the ID property
        if ('ID' in obj) {
            return String(obj.ID);
        }

        // Try GetAll for BaseEntity
        if ('GetAll' in obj && typeof obj.GetAll === 'function') {
            const allData = (obj as { GetAll: () => Record<string, unknown> }).GetAll();
            if ('ID' in allData) {
                return String(allData.ID);
            }
        }

        return null;
    }

    /**
     * Open an entity record using NavigationService
     */
    openEntityRecord(entityName: string, row: unknown): void {
        const recordId = this.getRecordId(row);
        if (!recordId || !entityName) return;

        // Create a CompositeKey with the ID
        const compositeKey = new CompositeKey([
            { FieldName: 'ID', Value: recordId }
        ]);

        this.navigationService.OpenEntityRecord(entityName, compositeKey);
    }

    /**
     * Open an entity in the explorer (placeholder - would need routing integration)
     */
    openEntityInExplorer(entityName: string): void {
        // This would integrate with the app's navigation/routing system
        // For now, just log and could be extended to emit an event or use router
        console.log(`Would open entity in explorer: ${entityName}`);
        // Could emit an event or use router:
        // this.router.navigate(['/entities', entityName]);
    }

    // === Deep Linking via Query Parameters ===

    /**
     * Apply query parameters to component state (deep linking support)
     * Query params take precedence over saved preferences
     */
    private applyQueryParams(): void {
        const params = this.route.snapshot.queryParams;

        // Section: ?section=engines|redundant|performance|cache
        if (params['section']) {
            const section = params['section'] as string;
            if (['engines', 'redundant', 'performance', 'cache'].includes(section)) {
                this.activeSection = section as 'engines' | 'redundant' | 'performance' | 'cache';
            }
        }

        // Performance tab: ?tab=monitor|overview|events|patterns|insights
        if (params['tab']) {
            const tab = params['tab'] as string;
            if (['monitor', 'overview', 'events', 'patterns', 'insights'].includes(tab)) {
                this.perfTab = tab as 'monitor' | 'overview' | 'events' | 'patterns' | 'insights';
            }
        }

        // Telemetry source: ?source=client|server
        if (params['source']) {
            const source = params['source'] as string;
            if (['client', 'server'].includes(source)) {
                this.telemetrySource = source as 'client' | 'server';
            }
        }

        // Category filter: ?category=all|data|api|render|...
        if (params['category']) {
            const category = params['category'] as string;
            if (category === 'all') {
                this.categoryFilter = 'all';
            } else {
                this.categoryFilter = category as TelemetryCategory;
            }
        }

        // Search query: ?search=...
        if (params['search']) {
            this.searchQuery = params['search'] as string;
        }

        // KPI cards collapsed: ?kpi=collapsed|expanded
        if (params['kpi']) {
            this.kpiCardsCollapsed = params['kpi'] === 'collapsed';
        }

        this.cdr.markForCheck();
    }

    /**
     * Update query parameters to reflect current state (for deep linking)
     * Uses NavigationService for proper URL management that respects app-scoped routes.
     */
    private updateQueryParams(): void {
        const queryParams: Record<string, string | null> = {
            section: this.activeSection !== 'engines' ? this.activeSection : null,
            tab: this.perfTab !== 'monitor' ? this.perfTab : null,
            source: this.telemetrySource !== 'client' ? this.telemetrySource : null,
            category: this.categoryFilter !== 'all' ? this.categoryFilter : null,
            search: this.searchQuery.trim() || null,
            kpi: this.kpiCardsCollapsed ? 'collapsed' : null
        };

        // Use NavigationService to update query params properly
        this.navigationService.UpdateActiveTabQueryParams(queryParams);
    }

    // === User Preferences Persistence ===

    /**
     * Load user preferences from MJ: User Settings entity using UserInfoEngine for cached access
     */
    private async loadUserPreferences(): Promise<void> {
        try {
            const userId = this.metadata.CurrentUser?.ID;
            if (!userId) {
                this.settingsLoaded = true;
                return;
            }

            const engine = UserInfoEngine.Instance;

            // Find setting from cached user settings
            const setting = engine.UserSettings.find(s => s.Setting === SYSTEM_DIAGNOSTICS_SETTINGS_KEY);

            if (setting) {
                this.userSettingEntity = setting;
                if (this.userSettingEntity.Value) {
                    const prefs = JSON.parse(this.userSettingEntity.Value) as Partial<SystemDiagnosticsUserPreferences>;
                    this.applyUserPreferences(prefs);
                }
            }

            this.settingsLoaded = true;
        } catch (error) {
            console.warn('Failed to load user preferences:', error);
            this.settingsLoaded = true;
        }
    }

    /**
     * Apply loaded user preferences to component state
     */
    private applyUserPreferences(prefs: Partial<SystemDiagnosticsUserPreferences>): void {
        if (prefs.kpiCardsCollapsed !== undefined) this.kpiCardsCollapsed = prefs.kpiCardsCollapsed;
        if (prefs.activeSection !== undefined) this.activeSection = prefs.activeSection;
        if (prefs.perfTab !== undefined) this.perfTab = prefs.perfTab;
        if (prefs.telemetrySource !== undefined) this.telemetrySource = prefs.telemetrySource;
        if (prefs.categoryFilter !== undefined) this.categoryFilter = prefs.categoryFilter;
        if (prefs.chartZoomLevel !== undefined) this.chartZoomLevel = prefs.chartZoomLevel;
        if (prefs.chartGapCompression !== undefined) this.chartGapCompression = prefs.chartGapCompression;
        if (prefs.autoRefresh !== undefined) this.autoRefresh = prefs.autoRefresh;
        this.cdr.markForCheck();
    }

    /**
     * Get current preferences as an object
     */
    private getCurrentPreferences(): SystemDiagnosticsUserPreferences {
        return {
            kpiCardsCollapsed: this.kpiCardsCollapsed,
            activeSection: this.activeSection,
            perfTab: this.perfTab,
            telemetrySource: this.telemetrySource,
            categoryFilter: this.categoryFilter,
            chartZoomLevel: this.chartZoomLevel,
            chartGapCompression: this.chartGapCompression,
            autoRefresh: this.autoRefresh
        };
    }

    /**
     * Debounced save of user preferences (500ms delay)
     * Also updates query params for deep linking
     */
    private saveUserPreferencesDebounced(): void {
        if (!this.settingsLoaded) return; // Don't save until we've loaded

        // Update query params immediately for deep linking
        this.updateQueryParams();

        if (this.saveSettingsTimeout) {
            clearTimeout(this.saveSettingsTimeout);
        }

        this.saveSettingsTimeout = setTimeout(() => {
            this.saveUserPreferences();
        }, 500);
    }

    /**
     * Save user preferences to MJ: User Settings entity using UserInfoEngine for cached lookup
     */
    private async saveUserPreferences(): Promise<void> {
        try {
            const userId = this.metadata.CurrentUser?.ID;
            if (!userId) return;

            // Find existing setting from cached user settings if not already loaded
            if (!this.userSettingEntity) {
                const engine = UserInfoEngine.Instance;
                const setting = engine.UserSettings.find(s => s.Setting === SYSTEM_DIAGNOSTICS_SETTINGS_KEY);

                if (setting) {
                    this.userSettingEntity = setting;
                } else {
                    this.userSettingEntity = await this.metadata.GetEntityObject<UserSettingEntity>('MJ: User Settings');
                    this.userSettingEntity.UserID = userId;
                    this.userSettingEntity.Setting = SYSTEM_DIAGNOSTICS_SETTINGS_KEY;
                }
            }

            // Save the preferences as JSON
            this.userSettingEntity.Value = JSON.stringify(this.getCurrentPreferences());
            await this.userSettingEntity.Save();
        } catch (error) {
            console.warn('Failed to save user preferences:', error);
        }
    }

    // === BaseResourceComponent Required Methods ===

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'System Diagnostics';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-stethoscope';
    }
}
